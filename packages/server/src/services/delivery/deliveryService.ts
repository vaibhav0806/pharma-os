/**
 * Delivery Service
 * Orchestrates delivery booking via Borzo
 */

import { query, queryOne, queryAll } from '../../db/client';
import { borzoClient, BorzoError } from './borzoClient';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import { sendWhatsAppMessage, templates } from '../whatsapp/sender';

export type DeliveryStatus =
  | 'pending'
  | 'calculating'
  | 'quoted'
  | 'booked'
  | 'courier_assigned'
  | 'in_transit'
  | 'delivered'
  | 'cancelled'
  | 'failed';

export interface Delivery {
  id: string;
  order_id: string;
  pharmacy_id: string;
  customer_id: string;
  borzo_order_id: string | null;
  borzo_order_number: string | null;
  tracking_url: string | null;
  status: DeliveryStatus;
  pickup_address: string;
  pickup_phone: string;
  pickup_contact_name: string | null;
  delivery_address: string;
  delivery_phone: string;
  delivery_contact_name: string | null;
  estimated_price: number | null;
  final_price: number | null;
  courier_name: string | null;
  courier_phone: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateDeliveryInput {
  orderId: string;
  pharmacyId: string;
  customerId: string;
  pickupAddress: string;
  pickupPhone: string;
  pickupContactName?: string;
  deliveryAddress: string;
  deliveryPhone: string;
  deliveryContactName?: string;
}

/**
 * Create a delivery record (without booking yet)
 */
export async function createDelivery(input: CreateDeliveryInput): Promise<Delivery> {
  const delivery = await queryOne<Delivery>(
    `INSERT INTO deliveries (
      order_id, pharmacy_id, customer_id,
      pickup_address, pickup_phone, pickup_contact_name,
      delivery_address, delivery_phone, delivery_contact_name,
      status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
    RETURNING *`,
    [
      input.orderId,
      input.pharmacyId,
      input.customerId,
      input.pickupAddress,
      input.pickupPhone,
      input.pickupContactName || null,
      input.deliveryAddress,
      input.deliveryPhone,
      input.deliveryContactName || null,
    ]
  );

  if (!delivery) {
    throw new Error('Failed to create delivery');
  }

  // Link delivery to order
  await query(`UPDATE orders SET delivery_id = $1 WHERE id = $2`, [
    delivery.id,
    input.orderId,
  ]);

  logger.info({
    event: 'delivery_created',
    deliveryId: delivery.id,
    orderId: input.orderId,
  });

  return delivery;
}

/**
 * Calculate delivery price
 */
export async function calculateDeliveryPrice(deliveryId: string): Promise<number> {
  const delivery = await getDeliveryById(deliveryId);
  if (!delivery) {
    throw new Error('Delivery not found');
  }

  // Update status to calculating
  await updateDeliveryStatus(deliveryId, 'calculating');

  try {
    const { amount } = await borzoClient.calculatePrice(
      delivery.pickup_address,
      delivery.pickup_phone,
      delivery.delivery_address,
      delivery.delivery_phone
    );

    // Update with estimated price
    await query(
      `UPDATE deliveries SET estimated_price = $1, status = 'quoted', updated_at = NOW()
       WHERE id = $2`,
      [amount, deliveryId]
    );

    logger.info({
      event: 'delivery_price_calculated',
      deliveryId,
      amount,
    });

    return amount;
  } catch (error) {
    await updateDeliveryStatus(deliveryId, 'failed');
    throw error;
  }
}

/**
 * Book delivery with Borzo
 */
export async function bookDelivery(
  deliveryId: string,
  orderNumber: string
): Promise<{ trackingUrl: string; price: number }> {
  const delivery = await getDeliveryById(deliveryId);
  if (!delivery) {
    throw new Error('Delivery not found');
  }

  if (!config.borzo.enabled) {
    logger.warn({ event: 'borzo_disabled', deliveryId });
    throw new Error('Borzo delivery is not enabled');
  }

  try {
    const result = await borzoClient.createOrder({
      pickupAddress: delivery.pickup_address,
      pickupPhone: delivery.pickup_phone,
      pickupName: delivery.pickup_contact_name || undefined,
      deliveryAddress: delivery.delivery_address,
      deliveryPhone: delivery.delivery_phone,
      deliveryName: delivery.delivery_contact_name || undefined,
      orderNumber,
      note: `Pharmacy order ${orderNumber}`,
    });

    // Update delivery with Borzo order details
    await query(
      `UPDATE deliveries SET
        borzo_order_id = $1,
        borzo_order_number = $2,
        tracking_url = $3,
        final_price = $4,
        status = 'booked',
        booked_at = NOW(),
        updated_at = NOW()
       WHERE id = $5`,
      [
        result.orderId,
        result.orderNumber,
        result.trackingUrl,
        result.price,
        deliveryId,
      ]
    );

    logger.info({
      event: 'delivery_booked',
      deliveryId,
      borzoOrderId: result.orderId,
      trackingUrl: result.trackingUrl,
    });

    return {
      trackingUrl: result.trackingUrl,
      price: result.price,
    };
  } catch (error) {
    await updateDeliveryStatus(deliveryId, 'failed');

    if (error instanceof BorzoError) {
      logger.error({
        event: 'borzo_booking_failed',
        deliveryId,
        errors: error.errors,
        parameterErrors: error.parameterErrors,
      });
    }

    throw error;
  }
}

/**
 * Cancel a delivery
 */
export async function cancelDelivery(deliveryId: string): Promise<void> {
  const delivery = await getDeliveryById(deliveryId);
  if (!delivery) {
    throw new Error('Delivery not found');
  }

  // If already booked with Borzo, cancel there too
  if (delivery.borzo_order_id && delivery.status === 'booked') {
    try {
      await borzoClient.cancelOrder(delivery.borzo_order_id);
    } catch (error) {
      logger.error({
        event: 'borzo_cancel_failed',
        deliveryId,
        borzoOrderId: delivery.borzo_order_id,
        error,
      });
      // Continue with local cancellation even if Borzo fails
    }
  }

  await updateDeliveryStatus(deliveryId, 'cancelled');

  logger.info({
    event: 'delivery_cancelled',
    deliveryId,
  });
}

/**
 * Get delivery by ID
 */
export async function getDeliveryById(deliveryId: string): Promise<Delivery | null> {
  return queryOne<Delivery>(`SELECT * FROM deliveries WHERE id = $1`, [deliveryId]);
}

/**
 * Get delivery by order ID
 */
export async function getDeliveryByOrderId(orderId: string): Promise<Delivery | null> {
  return queryOne<Delivery>(`SELECT * FROM deliveries WHERE order_id = $1`, [orderId]);
}

/**
 * Update delivery status
 */
export async function updateDeliveryStatus(
  deliveryId: string,
  status: DeliveryStatus
): Promise<void> {
  await query(`UPDATE deliveries SET status = $1, updated_at = NOW() WHERE id = $2`, [
    status,
    deliveryId,
  ]);
}

/**
 * Book delivery and send tracking to customer
 * Called when order is marked "ready_for_pickup"
 */
export async function bookDeliveryAndNotify(
  orderId: string,
  pharmacyId: string
): Promise<{ success: boolean; trackingUrl?: string; error?: string }> {
  // Get order with customer and pharmacy details
  const order = await queryOne<{
    id: string;
    order_number: string;
    customer_id: string;
    delivery_address: string | null;
    customer_phone: string;
    customer_name: string | null;
    pharmacy_name: string;
    pharmacy_address: string | null;
    pharmacy_phone: string;
    pharmacy_pickup_address: string | null;
    pharmacy_contact_name: string | null;
  }>(
    `SELECT o.id, o.order_number, o.customer_id, o.delivery_address,
            c.phone as customer_phone, c.name as customer_name,
            p.name as pharmacy_name, p.address as pharmacy_address, p.phone as pharmacy_phone,
            p.pickup_address as pharmacy_pickup_address, p.contact_name as pharmacy_contact_name
     FROM orders o
     JOIN customers c ON o.customer_id = c.id
     JOIN pharmacies p ON o.pharmacy_id = p.id
     WHERE o.id = $1 AND o.pharmacy_id = $2`,
    [orderId, pharmacyId]
  );

  if (!order) {
    return { success: false, error: 'Order not found' };
  }

  // Check if order has delivery address
  if (!order.delivery_address) {
    return { success: false, error: 'Delivery address not set. Please request address from customer.' };
  }

  // Check if pharmacy has pickup address
  const pickupAddress = order.pharmacy_pickup_address || order.pharmacy_address;
  if (!pickupAddress) {
    return { success: false, error: 'Pharmacy pickup address not configured' };
  }

  // Check if Borzo is enabled
  if (!config.borzo.enabled) {
    return { success: false, error: 'Delivery service not enabled' };
  }

  try {
    // Check for existing delivery
    let delivery = await getDeliveryByOrderId(orderId);

    if (!delivery) {
      // Create new delivery
      delivery = await createDelivery({
        orderId,
        pharmacyId,
        customerId: order.customer_id,
        pickupAddress,
        pickupPhone: order.pharmacy_phone,
        pickupContactName: order.pharmacy_contact_name || order.pharmacy_name,
        deliveryAddress: order.delivery_address!,
        deliveryPhone: order.customer_phone,
        deliveryContactName: order.customer_name || undefined,
      });
    }

    // Book with Borzo
    const { trackingUrl, price } = await bookDelivery(delivery.id, order.order_number);

    // Send tracking link to customer via WhatsApp
    await sendWhatsAppMessage({
      to: order.customer_phone,
      body: templates.deliveryBooked(order.order_number, trackingUrl),
      orderId,
      customerId: order.customer_id,
      pharmacyId,
    });

    logger.info({
      event: 'delivery_booked_and_notified',
      orderId,
      deliveryId: delivery.id,
      trackingUrl,
      price,
    });

    return { success: true, trackingUrl };
  } catch (error) {
    logger.error({
      event: 'delivery_booking_failed',
      orderId,
      error: error instanceof Error ? error.message : error,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to book delivery',
    };
  }
}

/**
 * Request delivery address from customer via WhatsApp
 */
export async function requestDeliveryAddress(
  orderId: string,
  customerPhone: string,
  orderNumber: string,
  customerId: string,
  pharmacyId: string
): Promise<void> {
  await sendWhatsAppMessage({
    to: customerPhone,
    body: templates.requestAddress(orderNumber),
    orderId,
    customerId,
    pharmacyId,
  });
}
