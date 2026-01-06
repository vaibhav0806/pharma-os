import { Router } from 'express';
import { getPharmacy, updatePharmacy } from '../controllers/pharmacyController';
import { authenticate } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get pharmacy details
router.get('/', getPharmacy);

// Update pharmacy settings
router.patch('/', updatePharmacy);

export default router;
