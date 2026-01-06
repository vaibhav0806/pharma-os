import { Router } from 'express';
import { getMediaProxy } from '../controllers/mediaController';
import { authenticate as requireAuth } from '../middleware/auth';

const router = Router();

// Protected route to proxy media
router.get('/proxy', requireAuth, getMediaProxy);

export default router;

