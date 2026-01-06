import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { logger } from './utils/logger';
import { testConnection } from './config/database';

// Import routes
import webhookRoutes from './api/routes/webhook.routes';
import authRoutes from './api/routes/auth.routes';
import orderRoutes from './api/routes/order.routes';
import pharmacyRoutes from './api/routes/pharmacy.routes';
import deliveryRoutes from './api/routes/delivery.routes';

// Import middleware
import { errorHandler } from './api/middleware/errorHandler';

const app = express();

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: config.cors.origin,
    credentials: true,
  })
);

// Body parsing - raw body needed for Twilio signature validation
app.use(
  '/api/webhook',
  express.urlencoded({ extended: false })
);
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/webhook', webhookRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/pharmacy', pharmacyRoutes);
app.use('/api/delivery', deliveryRoutes);

// Error handling
app.use(errorHandler);

// Start server
async function start() {
  // Test database connection
  const dbConnected = await testConnection();
  if (!dbConnected) {
    logger.error('Failed to connect to database. Exiting...');
    process.exit(1);
  }

  app.listen(config.port, () => {
    logger.info(`Server running on port ${config.port}`);
    logger.info(`Environment: ${config.env}`);
    logger.info(`Webhook URL: ${config.baseUrl}/api/webhook/twilio/incoming`);
  });
}

start().catch((error) => {
  logger.error('Failed to start server', error);
  process.exit(1);
});

export default app;
