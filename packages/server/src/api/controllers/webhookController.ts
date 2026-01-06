import { Request, Response } from 'express';
import { twiml } from 'twilio';
import { logger } from '../../utils/logger';
import { fromWhatsAppFormat } from '../../utils/phoneUtils';
import { findOrCreateCustomer } from '../../services/customer/customerService';
import { getPharmacyByWhatsAppNumber } from '../../services/pharmacy/pharmacyService';
import {
  createOrder,
  findActiveOrder,
  findPendingRxOrder,
  updateOrder,
  transitionOrderStatus,
} from '../../services/order/orderService';
import { parseOrderMessage, formatItemsForDisplay } from '../../services/whatsapp/parser';
import { query, queryOne } from '../../db/client';

interface TwilioWebhookBody {
  From: string;
  To: string;
  Body: string;
  NumMedia: string;
  MediaUrl0?: string;
  MediaContentType0?: string;
  MessageSid: string;
  ProfileName?: string;
}

/**
 * Handle incoming WhatsApp messages from Twilio
 */
export async function handleIncomingMessage(req: Request, res: Response) {
  const {
    From,
    To,
    Body,
    NumMedia,
    MediaUrl0,
    MediaContentType0,
    MessageSid,
    ProfileName,
  } = req.body as TwilioWebhookBody;

  const customerPhone = fromWhatsAppFormat(From);
  const pharmacyWhatsApp = fromWhatsAppFormat(To);

  logger.info({
    event: 'incoming_message',
    from: customerPhone,
    to: pharmacyWhatsApp,
    hasMedia: parseInt(NumMedia) > 0,
    messageSid: MessageSid,
  });

  try {
    // Find pharmacy by WhatsApp number
    const pharmacy = await getPharmacyByWhatsAppNumber(pharmacyWhatsApp);

    if (!pharmacy) {
      logger.warn({ event: 'pharmacy_not_found', whatsappNumber: pharmacyWhatsApp });
      return sendTwimlResponse(
        res,
        'Sorry, this pharmacy is not registered. Please contact support.'
      );
    }

    // Find or create customer
    const customer = await findOrCreateCustomer(customerPhone, ProfileName);

    // Log incoming message
    await query(
      `INSERT INTO messages (customer_id, pharmacy_id, direction, twilio_sid, from_number, to_number, body, media_url, status)
       VALUES ($1, $2, 'inbound', $3, $4, $5, $6, $7, 'received')`,
      [
        customer.id,
        pharmacy.id,
        MessageSid,
        customerPhone,
        pharmacyWhatsApp,
        Body,
        MediaUrl0 || null,
      ]
    );

    // Check if this is a prescription upload for existing order
    if (parseInt(NumMedia) > 0) {
      const pendingRxOrder = await findPendingRxOrder(customer.id, pharmacy.id);

      if (pendingRxOrder) {
        // Save prescription
        await query(
          `INSERT INTO prescriptions (order_id, customer_id, media_url, media_type)
           VALUES ($1, $2, $3, $4)`,
          [pendingRxOrder.id, customer.id, MediaUrl0, MediaContentType0]
        );

        // Update order status
        await transitionOrderStatus(pendingRxOrder.id, pharmacy.id, { type: 'RX_UPLOADED' });

        // Update message with order_id
        await query(
          `UPDATE messages SET order_id = $1 WHERE twilio_sid = $2`,
          [pendingRxOrder.id, MessageSid]
        );

        return sendTwimlResponse(
          res,
          `Thank you! We received your prescription for Order #${pendingRxOrder.order_number}.\n\nOur pharmacist will review it shortly.`
        );
      }
    }

    // Check if customer is replying with their address (for delivery)
    // Address typically has: numbers, commas, pincode pattern
    const looksLikeAddress = /\d{6}|\d+.*,|flat|house|street|road|sector|block|near/i.test(Body);
    if (looksLikeAddress && Body.length > 20) {
      // Check if there's a ready_for_pickup order waiting for address
      const orderNeedingAddress = await queryOne<{ id: string; order_number: string }>(
        `SELECT o.id, o.order_number FROM orders o
         JOIN customers c ON o.customer_id = c.id
         WHERE o.customer_id = $1 AND o.pharmacy_id = $2
         AND o.status IN ('ready_for_pickup', 'payment_confirmed', 'confirmed')
         AND (c.address IS NULL OR c.address = '')
         ORDER BY o.created_at DESC LIMIT 1`,
        [customer.id, pharmacy.id]
      );

      if (orderNeedingAddress) {
        // Save the address
        await query(
          `UPDATE customers SET address = $1, address_confirmed = true WHERE id = $2`,
          [Body.trim(), customer.id]
        );

        await query(
          `UPDATE messages SET order_id = $1 WHERE twilio_sid = $2`,
          [orderNeedingAddress.id, MessageSid]
        );

        logger.info({
          event: 'customer_address_saved',
          customerId: customer.id,
          orderId: orderNeedingAddress.id,
        });

        return sendTwimlResponse(
          res,
          `Thank you! Your delivery address has been saved.\n\nWe'll book the delivery for Order #${orderNeedingAddress.order_number} shortly.`
        );
      }
    }

    // Check for payment confirmation keywords
    const bodyLower = Body.toLowerCase().trim();
    if (['paid', 'payment done', 'done', 'completed'].includes(bodyLower)) {
      const awaitingPaymentOrder = await queryOne<{ id: string; order_number: string }>(
        `SELECT id, order_number FROM orders
         WHERE customer_id = $1 AND pharmacy_id = $2 AND status = 'awaiting_payment'
         ORDER BY created_at DESC LIMIT 1`,
        [customer.id, pharmacy.id]
      );

      if (awaitingPaymentOrder) {
        // Note: In production, verify payment before updating status
        // For V1, pharmacist manually confirms via dashboard
        await query(
          `UPDATE messages SET order_id = $1 WHERE twilio_sid = $2`,
          [awaitingPaymentOrder.id, MessageSid]
        );

        return sendTwimlResponse(
          res,
          `Thank you for your payment confirmation for Order #${awaitingPaymentOrder.order_number}.\n\nThe pharmacist will verify and confirm shortly.`
        );
      }
    }

    // Check for active order - add message to conversation
    const activeOrder = await findActiveOrder(customer.id, pharmacy.id);

    if (activeOrder) {
      // Update message with order_id
      await query(
        `UPDATE messages SET order_id = $1 WHERE twilio_sid = $2`,
        [activeOrder.id, MessageSid]
      );

      return sendTwimlResponse(
        res,
        `Message received for Order #${activeOrder.order_number}.\n\nThe pharmacist will respond shortly.`
      );
    }

    // Create new order
    const parseResult = parseOrderMessage(Body);

    const order = await createOrder({
      pharmacyId: pharmacy.id,
      customerId: customer.id,
      rawMessage: Body,
      parsedItems: parseResult.items,
      requiresRx: parseResult.requiresRx,
    });

    // Update message with order_id
    await query(
      `UPDATE messages SET order_id = $1 WHERE twilio_sid = $2`,
      [order.id, MessageSid]
    );

    // Build acknowledgment message
    const itemsDisplay = formatItemsForDisplay(parseResult.items);
    const greeting = ProfileName ? `Hi ${ProfileName}!` : 'Hi!';

    let acknowledgment = `${greeting} We received your order.\n\n${itemsDisplay}\n\nOrder #${order.order_number}`;

    if (parseResult.requiresRx) {
      acknowledgment += '\n\n*Note:* Some items may require a prescription. We will confirm shortly.';
    } else {
      acknowledgment += '\n\nWe will review and confirm shortly.';
    }

    return sendTwimlResponse(res, acknowledgment);
  } catch (error) {
    logger.error({ event: 'webhook_error', error });
    return sendTwimlResponse(
      res,
      'Sorry, we encountered an error processing your message. Please try again.'
    );
  }
}

/**
 * Handle Twilio message status callbacks
 */
export async function handleStatusCallback(req: Request, res: Response) {
  const { MessageSid, MessageStatus } = req.body;

  logger.debug({
    event: 'message_status_update',
    messageSid: MessageSid,
    status: MessageStatus,
  });

  // Update message status in database
  await query(`UPDATE messages SET status = $1 WHERE twilio_sid = $2`, [
    MessageStatus,
    MessageSid,
  ]);

  res.status(200).send('OK');
}

/**
 * Send TwiML response
 */
function sendTwimlResponse(res: Response, message: string) {
  const response = new twiml.MessagingResponse();
  response.message(message);
  res.type('text/xml').send(response.toString());
}
