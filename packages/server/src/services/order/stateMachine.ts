/**
 * Order Status State Machine
 * Defines valid state transitions for orders
 */

export type OrderStatus =
  | 'pending'
  | 'awaiting_rx'
  | 'rx_received'
  | 'under_review'
  | 'confirmed'
  | 'awaiting_payment'
  | 'payment_confirmed'
  | 'ready_for_pickup'
  | 'completed'
  | 'cancelled';

export type OrderEvent =
  | { type: 'RX_REQUIRED' }
  | { type: 'RX_UPLOADED' }
  | { type: 'START_REVIEW' }
  | { type: 'CONFIRM_AVAILABILITY'; totalAmount: number; paymentMethod: 'upi' | 'cod' }
  | { type: 'ITEMS_UNAVAILABLE'; reason: string }
  | { type: 'PAYMENT_RECEIVED' }
  | { type: 'MARK_READY' }
  | { type: 'MARK_COMPLETED' }
  | { type: 'CANCEL'; reason: string };

// Valid state transitions
const transitions: Record<OrderStatus, Partial<Record<OrderEvent['type'], OrderStatus | OrderStatus[]>>> = {
  pending: {
    RX_REQUIRED: 'awaiting_rx',
    START_REVIEW: 'under_review',
    CANCEL: 'cancelled',
  },
  awaiting_rx: {
    RX_UPLOADED: 'rx_received',
    CANCEL: 'cancelled',
  },
  rx_received: {
    START_REVIEW: 'under_review',
    CANCEL: 'cancelled',
  },
  under_review: {
    CONFIRM_AVAILABILITY: ['awaiting_payment', 'confirmed'], // awaiting_payment for UPI, confirmed for COD
    ITEMS_UNAVAILABLE: 'cancelled',
    RX_REQUIRED: 'awaiting_rx',
    CANCEL: 'cancelled',
  },
  confirmed: {
    MARK_READY: 'ready_for_pickup',
    CANCEL: 'cancelled',
  },
  awaiting_payment: {
    PAYMENT_RECEIVED: 'payment_confirmed',
    CANCEL: 'cancelled',
  },
  payment_confirmed: {
    MARK_READY: 'ready_for_pickup',
    CANCEL: 'cancelled',
  },
  ready_for_pickup: {
    MARK_COMPLETED: 'completed',
    CANCEL: 'cancelled',
  },
  completed: {},
  cancelled: {},
};

/**
 * Check if a transition is valid
 */
export function canTransition(currentStatus: OrderStatus, eventType: OrderEvent['type']): boolean {
  return transitions[currentStatus]?.[eventType] !== undefined;
}

/**
 * Get the next status after an event
 */
export function getNextStatus(
  currentStatus: OrderStatus,
  event: OrderEvent
): OrderStatus | null {
  const nextState = transitions[currentStatus]?.[event.type];

  if (!nextState) {
    return null;
  }

  // Handle CONFIRM_AVAILABILITY which can go to different states
  if (event.type === 'CONFIRM_AVAILABILITY' && Array.isArray(nextState)) {
    return event.paymentMethod === 'upi' ? 'awaiting_payment' : 'confirmed';
  }

  return nextState as OrderStatus;
}

/**
 * Customer notification messages for each status
 */
export const statusMessages: Record<OrderStatus, string> = {
  pending: 'We received your order and are processing it.',
  awaiting_rx: 'This order requires a prescription. Please upload a photo of your valid prescription.',
  rx_received: 'Thank you! We received your prescription and will review it shortly.',
  under_review: 'Your order is being reviewed by the pharmacist.',
  confirmed: 'Your order is confirmed! We will notify you when it is ready.',
  awaiting_payment: 'Please complete payment to proceed with your order.',
  payment_confirmed: 'Payment received! We are preparing your order.',
  ready_for_pickup: 'Your order is ready! Please coordinate with the pharmacy for delivery.',
  completed: 'Order completed. Thank you for choosing us!',
  cancelled: 'Your order has been cancelled.',
};

/**
 * Get display label for status
 */
export const statusLabels: Record<OrderStatus, string> = {
  pending: 'Pending',
  awaiting_rx: 'Awaiting Prescription',
  rx_received: 'Prescription Received',
  under_review: 'Under Review',
  confirmed: 'Confirmed',
  awaiting_payment: 'Awaiting Payment',
  payment_confirmed: 'Payment Confirmed',
  ready_for_pickup: 'Ready for Pickup',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/**
 * Check if status is terminal (no further transitions)
 */
export function isTerminalStatus(status: OrderStatus): boolean {
  return status === 'completed' || status === 'cancelled';
}

/**
 * Get all valid next statuses from current status
 */
export function getValidTransitions(currentStatus: OrderStatus): OrderEvent['type'][] {
  const statusTransitions = transitions[currentStatus];
  return Object.keys(statusTransitions || {}) as OrderEvent['type'][];
}
