import { Router } from 'express';
import {
  listOrders,
  getOrder,
  updateOrderStatus,
  updateOrder,
  requestPrescription,
  sendPaymentInstructions,
  getOrderMessages,
  sendCustomMessage,
} from '../controllers/orderController';
import { authenticate } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// List orders with filters
router.get('/', listOrders);

// Get single order
router.get('/:id', getOrder);

// Update order status
router.patch('/:id/status', updateOrderStatus);

// Update order details
router.patch('/:id', updateOrder);

// Request prescription from customer
router.post('/:id/request-rx', requestPrescription);

// Send payment instructions
router.post('/:id/send-payment', sendPaymentInstructions);

// Get message history for order
router.get('/:id/messages', getOrderMessages);

// Send custom message to customer
router.post('/:id/messages', sendCustomMessage);

export default router;
