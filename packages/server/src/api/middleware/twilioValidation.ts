import { Request, Response, NextFunction } from 'express';
import twilio from 'twilio';
import { config } from '../../config';
import { logger } from '../../utils/logger';

/**
 * Middleware to validate Twilio webhook signatures
 */
export function validateTwilioSignature(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Skip validation in development
  if (config.env === 'development') {
    return next();
  }

  const signature = req.headers['x-twilio-signature'] as string;

  if (!signature) {
    logger.warn('Missing Twilio signature');
    return res.status(403).json({ error: 'Missing signature' });
  }

  const url = `${config.baseUrl}${req.originalUrl}`;
  const params = req.body;

  const isValid = twilio.validateRequest(
    config.twilio.authToken,
    signature,
    url,
    params
  );

  if (!isValid) {
    logger.warn('Invalid Twilio signature');
    return res.status(403).json({ error: 'Invalid signature' });
  }

  next();
}
