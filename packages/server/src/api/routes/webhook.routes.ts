import { Router } from 'express';
import { handleIncomingMessage, handleStatusCallback } from '../controllers/webhookController';
import { validateTwilioSignature } from '../middleware/twilioValidation';

const router = Router();

// Twilio incoming message webhook
router.post('/twilio/incoming', validateTwilioSignature, handleIncomingMessage);

// Twilio status callback webhook
router.post('/twilio/status', validateTwilioSignature, handleStatusCallback);

export default router;
