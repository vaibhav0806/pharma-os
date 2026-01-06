import { query, queryOne, queryAll } from '../../db/client';
import { generateOrderNumber } from '../../utils/orderNumber';
import { OrderStatus, getNextStatus, OrderEvent } from './stateMachine';
import { logger } from '../../utils/logger';

export interface Order {
  id: string;
  order_number: string;
  pharmacy_id: string;
  customer_id: string;
  status: OrderStatus;
  raw_message: string;
  parsed_items: Array<{ name: string; quantity: number }> | null;
  requires_rx: boolean;
  rx_verified: boolean;
  payment_method: 'upi' | 'cod' | null;
  total_amount: number | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface OrderWithCustomer extends Order {
  customer_phone: string;
  customer_name: string | null;
  customer_address: string | null;
}

export interface CreateOrderInput {
  pharmacyId: string;
  customerId: string;
  rawMessage: string;
  parsedItems?: Array<{ name: string; quantity: number }>;
  requiresRx?: boolean;
}

export interface UpdateOrderInput {
  status?: OrderStatus;
  parsedItems?: Array<{ name: string; quantity: number }>;
  requiresRx?: boolean;
  rxVerified?: boolean;
  paymentMethod?: 'upi' | 'cod';
  totalAmount?: number;
  notes?: string;
}

export interface OrderFilters {
  pharmacyId: string;
  status?: OrderStatus;
  customerId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

/**
 * Create a new order
 */
export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const orderNumber = generateOrderNumber();

  const result = await queryOne<Order>(
    `INSERT INTO orders (order_number, pharmacy_id, customer_id, raw_message, parsed_items, requires_rx)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      orderNumber,
      input.pharmacyId,
      input.customerId,
      input.rawMessage,
      input.parsedItems ? JSON.stringify(input.parsedItems) : null,
      input.requiresRx || false,
    ]
  );

  if (!result) {
    throw new Error('Failed to create order');
  }

  // Log status history
  await logStatusChange(result.id, null, 'pending', null);

  logger.info({
    event: 'order_created',
    orderId: result.id,
    orderNumber,
    pharmacyId: input.pharmacyId,
  });

  return result;
}

/**
 * Get order by ID with customer info
 */
export async function getOrderById(
  orderId: string,
  pharmacyId: string
): Promise<OrderWithCustomer | null> {
  return queryOne<OrderWithCustomer>(
    `SELECT o.*, c.phone as customer_phone, c.name as customer_name, c.address as customer_address
     FROM orders o
     JOIN customers c ON o.customer_id = c.id
     WHERE o.id = $1 AND o.pharmacy_id = $2`,
    [orderId, pharmacyId]
  );
}

/**
 * Get order by order number
 */
export async function getOrderByNumber(
  orderNumber: string,
  pharmacyId: string
): Promise<OrderWithCustomer | null> {
  return queryOne<OrderWithCustomer>(
    `SELECT o.*, c.phone as customer_phone, c.name as customer_name, c.address as customer_address
     FROM orders o
     JOIN customers c ON o.customer_id = c.id
     WHERE o.order_number = $1 AND o.pharmacy_id = $2`,
    [orderNumber, pharmacyId]
  );
}

/**
 * List orders with filters
 */
export async function listOrders(
  filters: OrderFilters
): Promise<{ orders: OrderWithCustomer[]; total: number }> {
  const { pharmacyId, status, customerId, search, page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;

  const conditions: string[] = ['o.pharmacy_id = $1'];
  const params: unknown[] = [pharmacyId];
  let paramIndex = 2;

  if (status) {
    conditions.push(`o.status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }

  if (customerId) {
    conditions.push(`o.customer_id = $${paramIndex}`);
    params.push(customerId);
    paramIndex++;
  }

  if (search) {
    conditions.push(
      `(o.order_number ILIKE $${paramIndex} OR c.phone ILIKE $${paramIndex} OR c.name ILIKE $${paramIndex})`
    );
    params.push(`%${search}%`);
    paramIndex++;
  }

  const whereClause = conditions.join(' AND ');

  // Get total count
  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM orders o
     JOIN customers c ON o.customer_id = c.id
     WHERE ${whereClause}`,
    params
  );

  // Get orders
  const orders = await queryAll<OrderWithCustomer>(
    `SELECT o.*, c.phone as customer_phone, c.name as customer_name, c.address as customer_address
     FROM orders o
     JOIN customers c ON o.customer_id = c.id
     WHERE ${whereClause}
     ORDER BY o.created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  return {
    orders,
    total: parseInt(countResult?.count || '0', 10),
  };
}

/**
 * Update order
 */
export async function updateOrder(
  orderId: string,
  pharmacyId: string,
  input: UpdateOrderInput,
  changedBy?: string
): Promise<Order | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (input.parsedItems !== undefined) {
    sets.push(`parsed_items = $${paramIndex}`);
    params.push(JSON.stringify(input.parsedItems));
    paramIndex++;
  }

  if (input.requiresRx !== undefined) {
    sets.push(`requires_rx = $${paramIndex}`);
    params.push(input.requiresRx);
    paramIndex++;
  }

  if (input.rxVerified !== undefined) {
    sets.push(`rx_verified = $${paramIndex}`);
    params.push(input.rxVerified);
    paramIndex++;
  }

  if (input.paymentMethod !== undefined) {
    sets.push(`payment_method = $${paramIndex}`);
    params.push(input.paymentMethod);
    paramIndex++;
  }

  if (input.totalAmount !== undefined) {
    sets.push(`total_amount = $${paramIndex}`);
    params.push(input.totalAmount);
    paramIndex++;
  }

  if (input.notes !== undefined) {
    sets.push(`notes = $${paramIndex}`);
    params.push(input.notes);
    paramIndex++;
  }

  if (sets.length === 0) {
    return getOrderById(orderId, pharmacyId);
  }

  sets.push('updated_at = NOW()');

  const result = await queryOne<Order>(
    `UPDATE orders SET ${sets.join(', ')}
     WHERE id = $${paramIndex} AND pharmacy_id = $${paramIndex + 1}
     RETURNING *`,
    [...params, orderId, pharmacyId]
  );

  return result;
}

/**
 * Transition order status
 */
export async function transitionOrderStatus(
  orderId: string,
  pharmacyId: string,
  event: OrderEvent,
  changedBy?: string
): Promise<Order | null> {
  // Get current order
  const order = await getOrderById(orderId, pharmacyId);
  if (!order) {
    throw new Error('Order not found');
  }

  // Get next status
  const nextStatus = getNextStatus(order.status, event);
  if (!nextStatus) {
    throw new Error(
      `Invalid transition: Cannot apply ${event.type} to order in ${order.status} status`
    );
  }

  // Build update based on event
  const updateInput: UpdateOrderInput = { status: nextStatus };

  if (event.type === 'CONFIRM_AVAILABILITY') {
    updateInput.totalAmount = event.totalAmount;
    updateInput.paymentMethod = event.paymentMethod;
  }

  // Update order
  const updated = await queryOne<Order>(
    `UPDATE orders SET status = $1, total_amount = COALESCE($2, total_amount), payment_method = COALESCE($3, payment_method), updated_at = NOW()
     WHERE id = $4 AND pharmacy_id = $5
     RETURNING *`,
    [
      nextStatus,
      updateInput.totalAmount || null,
      updateInput.paymentMethod || null,
      orderId,
      pharmacyId,
    ]
  );

  if (updated) {
    // Log status change
    await logStatusChange(
      orderId,
      order.status,
      nextStatus,
      changedBy || null,
      event.type === 'CANCEL' ? (event as { type: 'CANCEL'; reason: string }).reason : undefined
    );

    logger.info({
      event: 'order_status_changed',
      orderId,
      fromStatus: order.status,
      toStatus: nextStatus,
      eventType: event.type,
      changedBy,
    });
  }

  return updated;
}

/**
 * Find active order for customer at pharmacy
 */
export async function findActiveOrder(
  customerId: string,
  pharmacyId: string
): Promise<Order | null> {
  return queryOne<Order>(
    `SELECT * FROM orders
     WHERE customer_id = $1 AND pharmacy_id = $2
     AND status NOT IN ('completed', 'cancelled')
     ORDER BY created_at DESC
     LIMIT 1`,
    [customerId, pharmacyId]
  );
}

/**
 * Find order awaiting prescription
 */
export async function findPendingRxOrder(
  customerId: string,
  pharmacyId: string
): Promise<Order | null> {
  return queryOne<Order>(
    `SELECT * FROM orders
     WHERE customer_id = $1 AND pharmacy_id = $2
     AND status = 'awaiting_rx'
     ORDER BY created_at DESC
     LIMIT 1`,
    [customerId, pharmacyId]
  );
}

/**
 * Log status change to history
 */
async function logStatusChange(
  orderId: string,
  fromStatus: OrderStatus | null,
  toStatus: OrderStatus,
  changedBy: string | null,
  reason?: string
): Promise<void> {
  await query(
    `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
     VALUES ($1, $2, $3, $4, $5)`,
    [orderId, fromStatus, toStatus, changedBy, reason || null]
  );
}
