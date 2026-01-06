/**
 * Database seed script
 * Run with: npx ts-node src/db/seed.ts
 */

import bcrypt from 'bcryptjs';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

async function seed() {
  logger.info('Starting database seed...');

  try {
    // Create a test pharmacy
    const pharmacyResult = await pool.query(
      `INSERT INTO pharmacies (name, phone, whatsapp_number, address, upi_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [
        'Test Pharmacy',
        '+919876543210',
        process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886',
        '123 Main Street, City',
        'testpharmacy@upi',
      ]
    );

    const pharmacyId = pharmacyResult.rows[0].id;
    logger.info(`Created/updated pharmacy: ${pharmacyId}`);

    // Create a test pharmacy user
    const passwordHash = await bcrypt.hash('password123', 10);

    await pool.query(
      `INSERT INTO pharmacy_users (pharmacy_id, email, password_hash, name, role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
       RETURNING id`,
      [pharmacyId, 'admin@pharmacy.com', passwordHash, 'Admin User', 'admin']
    );

    logger.info('Created/updated pharmacy user: admin@pharmacy.com');
    logger.info('Password: password123');

    logger.info('Seed completed successfully!');
  } catch (error) {
    logger.error('Seed failed', error);
    throw error;
  } finally {
    await pool.end();
  }
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
