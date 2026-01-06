import { queryOne } from '../../db/client';

export interface Pharmacy {
  id: string;
  name: string;
  phone: string;
  whatsapp_number: string;
  address: string | null;
  upi_id: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Get pharmacy by ID
 */
export async function getPharmacyById(id: string): Promise<Pharmacy | null> {
  return queryOne<Pharmacy>(`SELECT * FROM pharmacies WHERE id = $1`, [id]);
}

/**
 * Get pharmacy by WhatsApp number (Twilio number)
 */
export async function getPharmacyByWhatsAppNumber(
  whatsappNumber: string
): Promise<Pharmacy | null> {
  // Remove whatsapp: prefix if present
  const normalized = whatsappNumber.replace('whatsapp:', '').replace('+', '');

  return queryOne<Pharmacy>(
    `SELECT * FROM pharmacies
     WHERE REPLACE(whatsapp_number, '+', '') = $1
     AND is_active = true`,
    [normalized]
  );
}

/**
 * Update pharmacy settings
 */
export async function updatePharmacy(
  pharmacyId: string,
  updates: {
    name?: string;
    address?: string;
    upiId?: string;
  }
): Promise<Pharmacy | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (updates.name !== undefined) {
    sets.push(`name = $${paramIndex}`);
    params.push(updates.name);
    paramIndex++;
  }

  if (updates.address !== undefined) {
    sets.push(`address = $${paramIndex}`);
    params.push(updates.address);
    paramIndex++;
  }

  if (updates.upiId !== undefined) {
    sets.push(`upi_id = $${paramIndex}`);
    params.push(updates.upiId);
    paramIndex++;
  }

  if (sets.length === 0) {
    return getPharmacyById(pharmacyId);
  }

  sets.push('updated_at = NOW()');

  return queryOne<Pharmacy>(
    `UPDATE pharmacies SET ${sets.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING *`,
    [...params, pharmacyId]
  );
}
