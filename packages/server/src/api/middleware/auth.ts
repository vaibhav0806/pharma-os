import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { queryOne } from '../../db/client';

interface JWTPayload {
  userId: string;
  pharmacyId: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        pharmacyId: string;
        email: string;
        name: string;
        role: string;
      };
    }
  }
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);

  try {
    const payload = jwt.verify(token, config.jwt.secret) as JWTPayload;

    // Fetch user from database to ensure they still exist
    const user = await queryOne<{
      id: string;
      pharmacy_id: string;
      email: string;
      name: string;
      role: string;
    }>(
      `SELECT id, pharmacy_id, email, name, role
       FROM pharmacy_users
       WHERE id = $1`,
      [payload.userId]
    );

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = {
      id: user.id,
      pharmacyId: user.pharmacy_id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
