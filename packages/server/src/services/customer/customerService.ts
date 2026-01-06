import { queryOne } from '../../db/client';
import { toE164 } from '../../utils/phoneUtils';

export interface Customer {
  id: string;
  phone: string;
  name: string | null;
  address: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Find or create a customer by phone number
 */
export async function findOrCreateCustomer(
  phone: string,
  name?: string
): Promise<Customer> {
  const normalizedPhone = toE164(phone);

  // Try to find existing customer
  let customer = await queryOne<Customer>(
    `SELECT * FROM customers WHERE phone = $1`,
    [normalizedPhone]
  );

  if (customer) {
    // Update name if provided and customer doesn't have one
    if (name && !customer.name) {
      customer = await queryOne<Customer>(
        `UPDATE customers SET name = $1, updated_at = NOW()
         WHERE id = $2 RETURNING *`,
        [name, customer.id]
      );
    }
    return customer!;
  }

  // Create new customer
  customer = await queryOne<Customer>(
    `INSERT INTO customers (phone, name)
     VALUES ($1, $2)
     RETURNING *`,
    [normalizedPhone, name || null]
  );

  if (!customer) {
    throw new Error('Failed to create customer');
  }

  return customer;
}

/**
 * Update customer details
 */
export async function updateCustomer(
  customerId: string,
  updates: { name?: string; address?: string }
): Promise<Customer | null> {
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

  if (sets.length === 0) {
    return queryOne<Customer>(`SELECT * FROM customers WHERE id = $1`, [customerId]);
  }

  sets.push('updated_at = NOW()');

  return queryOne<Customer>(
    `UPDATE customers SET ${sets.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING *`,
    [...params, customerId]
  );
}

/**
 * Get customer by phone
 */
export async function getCustomerByPhone(phone: string): Promise<Customer | null> {
  const normalizedPhone = toE164(phone);
  return queryOne<Customer>(`SELECT * FROM customers WHERE phone = $1`, [normalizedPhone]);
}

/**
 * Get customer by ID
 */
export async function getCustomerById(id: string): Promise<Customer | null> {
  return queryOne<Customer>(`SELECT * FROM customers WHERE id = $1`, [id]);
}
