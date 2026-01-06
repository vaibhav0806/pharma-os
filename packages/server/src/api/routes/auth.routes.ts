import { Router } from 'express';
import { login, getMe } from '../controllers/authController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Login
router.post('/login', login);

// Get current user
router.get('/me', authenticate, getMe);

export default router;
