import { twilioClient, twilioWhatsAppNumber } from '../../config/twilio';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { query } from '../../db/client';
import { toWhatsAppFormat } from '../../utils/phoneUtils';

interface SendMessageOptions {
  to: string;
  body: string;
  mediaUrl?: string;
  orderId?: string;
  customerId?: string;
  pharmacyId?: string;
}

/**
 * Send a WhatsApp message via Twilio
 */
export async function sendWhatsAppMessage(
  options: SendMessageOptions
): Promise<string> {
  const { to, body, mediaUrl, orderId, customerId, pharmacyId } = options;

  const message = await twilioClient.messages.create({
    from: toWhatsAppFormat(twilioWhatsAppNumber),
    to: toWhatsAppFormat(to),
    body,
    ...(mediaUrl && { mediaUrl: [mediaUrl] }),
    statusCallback: `${config.baseUrl}/api/webhook/twilio/status`,
  });

  logger.info({
    event: 'whatsapp_message_sent',
    to,
    sid: message.sid,
    orderId,
  });

  // Log message to database
  await query(
    `INSERT INTO messages (order_id, customer_id, pharmacy_id, direction, twilio_sid, from_number, to_number, body, media_url, status)
     VALUES ($1, $2, $3, 'outbound', $4, $5, $6, $7, $8, 'sent')`,
    [
      orderId || null,
      customerId || null,
      pharmacyId || null,
      message.sid,
      twilioWhatsAppNumber,
      to,
      body,
      mediaUrl || null,
    ]
  );

  return message.sid;
}

// Message templates
export const templates = {
  orderReceived: (orderNumber: string, items: string, customerName?: string) => {
    const greeting = customerName ? `Hi ${customerName}!` : 'Hi!';
    return `${greeting} We received your order.\n\n${items}\n\nOrder #${orderNumber}\n\nWe'll review and confirm shortly.`;
  },

  rxRequired: (orderNumber: string) =>
    `Order #${orderNumber}: Some items require a prescription.\n\nPlease reply with a photo of your valid prescription.`,

  rxReceived: (orderNumber: string) =>
    `Thank you! We received your prescription for Order #${orderNumber}.\n\nOur pharmacist will review it shortly.`,

  orderConfirmed: (orderNumber: string, total: number, paymentMethod: 'upi' | 'cod') => {
    const paymentInfo =
      paymentMethod === 'upi'
        ? 'Please complete the UPI payment (details below) to proceed.'
        : 'Payment will be collected on delivery.';

    return `Order #${orderNumber} is confirmed!\n\nTotal: Rs. ${total.toFixed(2)}\n\n${paymentInfo}`;
  },

  paymentInstructions: (upiId: string, total: number, orderNumber: string) =>
    `Payment Details:\n\nUPI ID: ${upiId}\nAmount: Rs. ${total.toFixed(2)}\nNote: ${orderNumber}\n\nPlease reply "PAID" once you've completed the payment.`,

  paymentReceived: (orderNumber: string) =>
    `Payment confirmed for Order #${orderNumber}!\n\nWe're preparing your order now.`,

  orderReady: (orderNumber: string) =>
    `Order #${orderNumber} is ready!\n\nPlease coordinate with the pharmacy for pickup or delivery.`,

  orderReadyDeliveryPending: (orderNumber: string) =>
    `Order #${orderNumber} is ready!\n\nWe're arranging delivery for you. You'll receive tracking details shortly.`,

  orderCancelled: (orderNumber: string, reason?: string) => {
    const reasonText = reason ? `\n\nReason: ${reason}` : '';
    return `Order #${orderNumber} has been cancelled.${reasonText}\n\nPlease contact us if you have any questions.`;
  },

  customMessage: (orderNumber: string, message: string) =>
    `Regarding Order #${orderNumber}:\n\n${message}`,

  deliveryBooked: (orderNumber: string, trackingUrl: string) =>
    `🚴 Delivery booked for Order #${orderNumber}!\n\nTrack your order here:\n${trackingUrl}\n\nYou'll receive updates as your order is on its way.`,

  requestAddress: (orderNumber: string) =>
    `To deliver Order #${orderNumber}, we need your delivery address.\n\nPlease reply with your complete address including:\n- House/Flat number\n- Street/Area\n- City, Pincode\n- Landmark (optional)`,

  courierAssigned: (orderNumber: string, courierName: string, courierPhone: string) =>
    `Order #${orderNumber} update:\n\n🏍️ Courier assigned!\nName: ${courierName}\nPhone: ${courierPhone}\n\nYour order is being picked up.`,

  orderInTransit: (orderNumber: string, trackingUrl: string) =>
    `Order #${orderNumber} is on the way! 🚴\n\nTrack live: ${trackingUrl}`,

  orderDelivered: (orderNumber: string) =>
    `✅ Order #${orderNumber} has been delivered!\n\nThank you for ordering with us. Hope to serve you again soon!`,
};

/**
 * Send order confirmation to customer
 */
export async function sendOrderConfirmation(
  customerPhone: string,
  orderNumber: string,
  items: string,
  customerName: string | undefined,
  orderId: string,
  customerId: string,
  pharmacyId: string
): Promise<string> {
  return sendWhatsAppMessage({
    to: customerPhone,
    body: templates.orderReceived(orderNumber, items, customerName),
    orderId,
    customerId,
    pharmacyId,
  });
}

/**
 * Request prescription from customer
 */
export async function requestPrescription(
  customerPhone: string,
  orderNumber: string,
  orderId: string,
  customerId: string,
  pharmacyId: string
): Promise<string> {
  return sendWhatsAppMessage({
    to: customerPhone,
    body: templates.rxRequired(orderNumber),
    orderId,
    customerId,
    pharmacyId,
  });
}

/**
 * Send payment instructions
 */
export async function sendPaymentDetails(
  customerPhone: string,
  orderNumber: string,
  total: number,
  upiId: string,
  orderId: string,
  customerId: string,
  pharmacyId: string
): Promise<string> {
  return sendWhatsAppMessage({
    to: customerPhone,
    body: templates.paymentInstructions(upiId, total, orderNumber),
    orderId,
    customerId,
    pharmacyId,
  });
}
