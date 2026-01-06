import { Request, Response } from 'express';
import { z } from 'zod';
import {
  listOrders as listOrdersService,
  getOrderById,
  updateOrder as updateOrderService,
  transitionOrderStatus,
} from '../../services/order/orderService';
import { getPharmacyById } from '../../services/pharmacy/pharmacyService';
import {
  sendWhatsAppMessage,
  templates,
  requestPrescription as sendRxRequest,
  sendPaymentDetails,
} from '../../services/whatsapp/sender';
import { queryAll } from '../../db/client';
import { OrderStatus, statusMessages } from '../../services/order/stateMachine';

const listOrdersSchema = z.object({
  status: z.enum([
    'pending',
    'awaiting_rx',
    'rx_received',
    'under_review',
    'confirmed',
    'awaiting_payment',
    'payment_confirmed',
    'ready_for_pickup',
    'completed',
    'cancelled',
  ]).optional(),
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

const updateStatusSchema = z.object({
  status: z.enum([
    'under_review',
    'confirmed',
    'awaiting_payment',
    'payment_confirmed',
    'ready_for_pickup',
    'completed',
    'cancelled',
  ]),
  totalAmount: z.number().positive().optional(),
  paymentMethod: z.enum(['upi', 'cod']).optional(),
  reason: z.string().optional(),
  notifyCustomer: z.boolean().default(true),
});

const updateOrderSchema = z.object({
  parsedItems: z
    .array(
      z.object({
        name: z.string(),
        quantity: z.number().positive(),
      })
    )
    .optional(),
  notes: z.string().optional(),
  totalAmount: z.number().positive().optional(),
});

const sendMessageSchema = z.object({
  message: z.string().min(1).max(1000),
});

/**
 * List orders with filters
 */
export async function listOrders(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const filters = listOrdersSchema.parse(req.query);

  const { orders, total } = await listOrdersService({
    pharmacyId: req.user.pharmacyId,
    ...filters,
  });

  return res.json({
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.order_number,
      customer: {
        id: o.customer_id,
        phone: o.customer_phone,
        name: o.customer_name,
      },
      status: o.status,
      rawMessage: o.raw_message,
      parsedItems: o.parsed_items,
      requiresRx: o.requires_rx,
      rxVerified: o.rx_verified,
      paymentMethod: o.payment_method,
      totalAmount: o.total_amount,
      notes: o.notes,
      createdAt: o.created_at,
      updatedAt: o.updated_at,
    })),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.ceil(total / filters.limit),
    },
  });
}

/**
 * Get single order
 */
export async function getOrder(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const order = await getOrderById(req.params.id, req.user.pharmacyId);

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  // Get prescriptions
  const prescriptions = await queryAll<{
    id: string;
    media_url: string;
    media_type: string;
    is_valid: boolean | null;
    created_at: Date;
  }>(
    `SELECT id, media_url, media_type, is_valid, created_at
     FROM prescriptions WHERE order_id = $1 ORDER BY created_at`,
    [order.id]
  );

  return res.json({
    id: order.id,
    orderNumber: order.order_number,
    customer: {
      id: order.customer_id,
      phone: order.customer_phone,
      name: order.customer_name,
      address: order.customer_address,
    },
    status: order.status,
    rawMessage: order.raw_message,
    parsedItems: order.parsed_items,
    requiresRx: order.requires_rx,
    rxVerified: order.rx_verified,
    paymentMethod: order.payment_method,
    totalAmount: order.total_amount,
    notes: order.notes,
    prescriptions: prescriptions.map((p) => ({
      id: p.id,
      mediaUrl: p.media_url,
      mediaType: p.media_type,
      isValid: p.is_valid,
      createdAt: p.created_at,
    })),
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  });
}

/**
 * Update order status
 */
export async function updateOrderStatus(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { status, totalAmount, paymentMethod, reason, notifyCustomer } =
    updateStatusSchema.parse(req.body);

  const order = await getOrderById(req.params.id, req.user.pharmacyId);

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  // Build event based on target status
  let event: Parameters<typeof transitionOrderStatus>[2];

  switch (status) {
    case 'under_review':
      event = { type: 'START_REVIEW' };
      break;
    case 'confirmed':
    case 'awaiting_payment':
      if (!totalAmount) {
        return res.status(400).json({ error: 'Total amount is required' });
      }
      event = {
        type: 'CONFIRM_AVAILABILITY',
        totalAmount,
        paymentMethod: paymentMethod || 'cod',
      };
      break;
    case 'payment_confirmed':
      event = { type: 'PAYMENT_RECEIVED' };
      break;
    case 'ready_for_pickup':
      event = { type: 'MARK_READY' };
      break;
    case 'completed':
      event = { type: 'MARK_COMPLETED' };
      break;
    case 'cancelled':
      event = { type: 'CANCEL', reason: reason || 'Cancelled by pharmacy' };
      break;
    default:
      return res.status(400).json({ error: 'Invalid status transition' });
  }

  try {
    const updated = await transitionOrderStatus(
      order.id,
      req.user.pharmacyId,
      event,
      req.user.id
    );

    // Send notification to customer if requested
    if (notifyCustomer && updated) {
      let message: string;

      switch (status) {
        case 'awaiting_payment':
          const pharmacy = await getPharmacyById(req.user.pharmacyId);
          message = templates.orderConfirmed(order.order_number, totalAmount!, 'upi');
          await sendWhatsAppMessage({
            to: order.customer_phone,
            body: message,
            orderId: order.id,
            customerId: order.customer_id,
            pharmacyId: req.user.pharmacyId,
          });
          // Send payment instructions
          if (pharmacy?.upi_id) {
            await sendPaymentDetails(
              order.customer_phone,
              order.order_number,
              totalAmount!,
              pharmacy.upi_id,
              order.id,
              order.customer_id,
              req.user.pharmacyId
            );
          }
          break;
        case 'confirmed':
          message = templates.orderConfirmed(order.order_number, totalAmount!, 'cod');
          break;
        case 'payment_confirmed':
          message = templates.paymentReceived(order.order_number);
          break;
        case 'ready_for_pickup':
          message = templates.orderReady(order.order_number);
          break;
        case 'cancelled':
          message = templates.orderCancelled(order.order_number, reason);
          break;
        default:
          message = statusMessages[status as OrderStatus];
      }

      if (message && status !== 'awaiting_payment') {
        await sendWhatsAppMessage({
          to: order.customer_phone,
          body: message,
          orderId: order.id,
          customerId: order.customer_id,
          pharmacyId: req.user.pharmacyId,
        });
      }
    }

    return res.json({ success: true, order: updated });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid transition')) {
      return res.status(400).json({ error: error.message });
    }
    throw error;
  }
}

/**
 * Update order details
 */
export async function updateOrder(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const input = updateOrderSchema.parse(req.body);

  const updated = await updateOrderService(
    req.params.id,
    req.user.pharmacyId,
    input,
    req.user.id
  );

  if (!updated) {
    return res.status(404).json({ error: 'Order not found' });
  }

  return res.json({ success: true, order: updated });
}

/**
 * Request prescription from customer
 */
export async function requestPrescription(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const order = await getOrderById(req.params.id, req.user.pharmacyId);

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  // Transition to awaiting_rx status
  await transitionOrderStatus(
    order.id,
    req.user.pharmacyId,
    { type: 'RX_REQUIRED' },
    req.user.id
  );

  // Send request to customer
  await sendRxRequest(
    order.customer_phone,
    order.order_number,
    order.id,
    order.customer_id,
    req.user.pharmacyId
  );

  return res.json({ success: true });
}

/**
 * Send payment instructions
 */
export async function sendPaymentInstructions(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const order = await getOrderById(req.params.id, req.user.pharmacyId);

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  if (!order.total_amount) {
    return res.status(400).json({ error: 'Order total amount not set' });
  }

  const pharmacy = await getPharmacyById(req.user.pharmacyId);

  if (!pharmacy?.upi_id) {
    return res.status(400).json({ error: 'Pharmacy UPI ID not configured' });
  }

  await sendPaymentDetails(
    order.customer_phone,
    order.order_number,
    order.total_amount,
    pharmacy.upi_id,
    order.id,
    order.customer_id,
    req.user.pharmacyId
  );

  return res.json({ success: true });
}

/**
 * Get message history for order
 */
export async function getOrderMessages(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const messages = await queryAll<{
    id: string;
    direction: string;
    body: string;
    media_url: string | null;
    status: string;
    created_at: Date;
  }>(
    `SELECT id, direction, body, media_url, status, created_at
     FROM messages
     WHERE order_id = $1 AND pharmacy_id = $2
     ORDER BY created_at ASC`,
    [req.params.id, req.user.pharmacyId]
  );

  return res.json({
    messages: messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      body: m.body,
      mediaUrl: m.media_url,
      status: m.status,
      createdAt: m.created_at,
    })),
  });
}

/**
 * Send custom message to customer
 */
export async function sendCustomMessage(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { message } = sendMessageSchema.parse(req.body);

  const order = await getOrderById(req.params.id, req.user.pharmacyId);

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  await sendWhatsAppMessage({
    to: order.customer_phone,
    body: templates.customMessage(order.order_number, message),
    orderId: order.id,
    customerId: order.customer_id,
    pharmacyId: req.user.pharmacyId,
  });

  return res.json({ success: true });
}
