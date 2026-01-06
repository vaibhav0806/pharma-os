import { Request, Response } from 'express';
import { z } from 'zod';
import {
  getPharmacyById,
  updatePharmacy as updatePharmacyService,
} from '../../services/pharmacy/pharmacyService';

const updatePharmacySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  address: z.string().max(500).optional(),
  upiId: z.string().max(100).optional(),
});

/**
 * Get pharmacy details
 */
export async function getPharmacy(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const pharmacy = await getPharmacyById(req.user.pharmacyId);

  if (!pharmacy) {
    return res.status(404).json({ error: 'Pharmacy not found' });
  }

  return res.json({
    id: pharmacy.id,
    name: pharmacy.name,
    phone: pharmacy.phone,
    whatsappNumber: pharmacy.whatsapp_number,
    address: pharmacy.address,
    upiId: pharmacy.upi_id,
    isActive: pharmacy.is_active,
    createdAt: pharmacy.created_at,
    updatedAt: pharmacy.updated_at,
  });
}

/**
 * Update pharmacy settings
 */
export async function updatePharmacy(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Only admin can update pharmacy settings
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can update pharmacy settings' });
  }

  const input = updatePharmacySchema.parse(req.body);

  const updated = await updatePharmacyService(req.user.pharmacyId, input);

  if (!updated) {
    return res.status(404).json({ error: 'Pharmacy not found' });
  }

  return res.json({
    id: updated.id,
    name: updated.name,
    phone: updated.phone,
    whatsappNumber: updated.whatsapp_number,
    address: updated.address,
    upiId: updated.upi_id,
    isActive: updated.is_active,
    createdAt: updated.created_at,
    updatedAt: updated.updated_at,
  });
}
