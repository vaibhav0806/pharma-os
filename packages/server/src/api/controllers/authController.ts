import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { queryOne } from '../../db/client';
import { config } from '../../config';
import { logger } from '../../utils/logger';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

interface PharmacyUser {
  id: string;
  pharmacy_id: string;
  email: string;
  password_hash: string;
  name: string;
  role: string;
}

/**
 * Login pharmacy user
 */
export async function login(req: Request, res: Response) {
  try {
    const { email, password } = loginSchema.parse(req.body);

    // Find user
    const user = await queryOne<PharmacyUser>(
      `SELECT * FROM pharmacy_users WHERE email = $1`,
      [email.toLowerCase()]
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT
    const token = jwt.sign(
      {
        userId: user.id,
        pharmacyId: user.pharmacy_id,
        email: user.email,
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    logger.info({
      event: 'user_login',
      userId: user.id,
      email: user.email,
    });

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        pharmacyId: user.pharmacy_id,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    throw error;
  }
}

/**
 * Get current user info
 */
export async function getMe(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Get full user details including pharmacy info
  const result = await queryOne<{
    id: string;
    email: string;
    name: string;
    role: string;
    pharmacy_id: string;
    pharmacy_name: string;
  }>(
    `SELECT u.id, u.email, u.name, u.role, u.pharmacy_id, p.name as pharmacy_name
     FROM pharmacy_users u
     JOIN pharmacies p ON u.pharmacy_id = p.id
     WHERE u.id = $1`,
    [req.user.id]
  );

  if (!result) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.json({
    id: result.id,
    email: result.email,
    name: result.name,
    role: result.role,
    pharmacyId: result.pharmacy_id,
    pharmacyName: result.pharmacy_name,
  });
}
