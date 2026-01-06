import twilio from 'twilio';
import { config } from './index';

export const twilioClient = twilio(
  config.twilio.accountSid,
  config.twilio.authToken
);

export const twilioWhatsAppNumber = config.twilio.whatsappNumber;
