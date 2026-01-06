import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getDelivery,
  bookDelivery,
  cancelOrderDelivery,
  getDeliveryEstimate,
  borzoWebhook,
  getDeliveryConfig,
} from '../controllers/deliveryController';

const router = Router();

// Public webhook route (no auth - Borzo will call this)
router.post('/webhook/borzo', borzoWebhook);

// Protected routes
router.use(authenticate);

// Get delivery config/status
router.get('/config', getDeliveryConfig);

// Get delivery for an order
router.get('/order/:orderId', getDelivery);

// Book delivery for an order
router.post('/book', bookDelivery);

// Get price estimate for delivery
router.get('/order/:orderId/estimate', getDeliveryEstimate);

// Cancel delivery
router.delete('/order/:orderId', cancelOrderDelivery);

export default router;
