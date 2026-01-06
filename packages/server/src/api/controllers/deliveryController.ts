import { Request, Response } from 'express';
import { z } from 'zod';
import {
  getDeliveryById,
  getDeliveryByOrderId,
  bookDeliveryAndNotify,
  cancelDelivery,
  calculateDeliveryPrice,
  updateDeliveryStatus,
  DeliveryStatus,
} from '../../services/delivery/deliveryService';
import { borzoClient } from '../../services/delivery/borzoClient';
import { getOrderById } from '../../services/order/orderService';
import { sendWhatsAppMessage, templates } from '../../services/whatsapp/sender';
import { queryOne } from '../../db/client';
import { logger } from '../../utils/logger';
import { config } from '../../config';

const bookDeliverySchema = z.object({
  orderId: z.string().uuid(),
});

/**
 * Get delivery for an order
 */
export async function getDelivery(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { orderId } = req.params;

  // Verify order belongs to pharmacy
  const order = await getOrderById(orderId, req.user.pharmacyId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const delivery = await getDeliveryByOrderId(orderId);

  if (!delivery) {
    return res.json({ delivery: null });
  }

  return res.json({
    delivery: {
      id: delivery.id,
      status: delivery.status,
      trackingUrl: delivery.tracking_url,
      borzoOrderId: delivery.borzo_order_id,
      borzoOrderNumber: delivery.borzo_order_number,
      pickupAddress: delivery.pickup_address,
      deliveryAddress: delivery.delivery_address,
      estimatedPrice: delivery.estimated_price ? Number(delivery.estimated_price) : null,
      finalPrice: delivery.final_price ? Number(delivery.final_price) : null,
      courierName: delivery.courier_name,
      courierPhone: delivery.courier_phone,
      createdAt: delivery.created_at,
      updatedAt: delivery.updated_at,
    },
  });
}

/**
 * Book delivery for an order
 */
export async function bookDelivery(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { orderId } = bookDeliverySchema.parse(req.body);

  // Verify order belongs to pharmacy
  const order = await getOrderById(orderId, req.user.pharmacyId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  if (!config.borzo.enabled) {
    return res.status(400).json({ error: 'Delivery service not enabled' });
  }

  const result = await bookDeliveryAndNotify(orderId, req.user.pharmacyId);

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.json({
    success: true,
    trackingUrl: result.trackingUrl,
  });
}

/**
 * Cancel a delivery
 */
export async function cancelOrderDelivery(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { orderId } = req.params;

  // Verify order belongs to pharmacy
  const order = await getOrderById(orderId, req.user.pharmacyId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const delivery = await getDeliveryByOrderId(orderId);
  if (!delivery) {
    return res.status(404).json({ error: 'No delivery found for this order' });
  }

  await cancelDelivery(delivery.id);

  return res.json({ success: true });
}

/**
 * Get delivery price estimate
 */
export async function getDeliveryEstimate(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { orderId } = req.params;

  // Verify order belongs to pharmacy
  const order = await getOrderById(orderId, req.user.pharmacyId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const delivery = await getDeliveryByOrderId(orderId);
  if (!delivery) {
    return res.status(404).json({ error: 'No delivery found for this order' });
  }

  const price = await calculateDeliveryPrice(delivery.id);

  return res.json({
    estimatedPrice: price,
    currency: 'INR',
  });
}

/**
 * Borzo webhook handler for delivery status updates
 */
export async function borzoWebhook(req: Request, res: Response) {
  const { order_id, new_status, courier } = req.body;

  logger.info({
    event: 'borzo_webhook_received',
    borzoOrderId: order_id,
    newStatus: new_status,
  });

  // Find delivery by Borzo order ID
  const delivery = await queryOne<{
    id: string;
    order_id: string;
    customer_id: string;
    pharmacy_id: string;
  }>(
    `SELECT d.id, d.order_id, d.customer_id, d.pharmacy_id
     FROM deliveries d WHERE d.borzo_order_id = $1`,
    [order_id?.toString()]
  );

  if (!delivery) {
    logger.warn({ event: 'borzo_webhook_delivery_not_found', borzoOrderId: order_id });
    return res.json({ ok: true }); // Still return 200 to acknowledge
  }

  // Map Borzo status to our status
  const statusMap: Record<string, DeliveryStatus> = {
    available: 'booked',
    active: 'courier_assigned',
    performer_found: 'courier_assigned',
    performer_on_the_way: 'in_transit',
    delivering: 'in_transit',
    completed: 'delivered',
    cancelled: 'cancelled',
    failed: 'failed',
  };

  const newDeliveryStatus = statusMap[new_status];

  if (newDeliveryStatus) {
    await updateDeliveryStatus(delivery.id, newDeliveryStatus);

    // Update courier info if provided
    if (courier && newDeliveryStatus === 'courier_assigned') {
      await queryOne(
        `UPDATE deliveries SET courier_name = $1, courier_phone = $2, updated_at = NOW()
         WHERE id = $3`,
        [courier.name, courier.phone, delivery.id]
      );

      // Get order details for notification
      const orderDetails = await queryOne<{ order_number: string; customer_phone: string }>(
        `SELECT o.order_number, c.phone as customer_phone
         FROM orders o JOIN customers c ON o.customer_id = c.id
         WHERE o.id = $1`,
        [delivery.order_id]
      );

      if (orderDetails) {
        await sendWhatsAppMessage({
          to: orderDetails.customer_phone,
          body: templates.courierAssigned(orderDetails.order_number, courier.name, courier.phone),
          orderId: delivery.order_id,
          customerId: delivery.customer_id,
          pharmacyId: delivery.pharmacy_id,
        });
      }
    }

    // Send delivered notification
    if (newDeliveryStatus === 'delivered') {
      const orderDetails = await queryOne<{ order_number: string; customer_phone: string }>(
        `SELECT o.order_number, c.phone as customer_phone
         FROM orders o JOIN customers c ON o.customer_id = c.id
         WHERE o.id = $1`,
        [delivery.order_id]
      );

      if (orderDetails) {
        await sendWhatsAppMessage({
          to: orderDetails.customer_phone,
          body: templates.orderDelivered(orderDetails.order_number),
          orderId: delivery.order_id,
          customerId: delivery.customer_id,
          pharmacyId: delivery.pharmacy_id,
        });
      }

      // Update order status to completed
      await queryOne(
        `UPDATE orders SET status = 'completed', updated_at = NOW() WHERE id = $1`,
        [delivery.order_id]
      );
    }

    logger.info({
      event: 'borzo_webhook_processed',
      deliveryId: delivery.id,
      newStatus: newDeliveryStatus,
    });
  }

  return res.json({ ok: true });
}

/**
 * Check delivery service status/config
 */
export async function getDeliveryConfig(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  return res.json({
    enabled: config.borzo.enabled,
    provider: 'borzo',
  });
}
