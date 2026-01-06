-- Add delivery address to orders (per-order, not per-customer)
-- This allows customers to use different addresses for different orders

ALTER TABLE orders ADD COLUMN delivery_address TEXT;

-- Remove address_confirmed from customers (if exists) since we're moving to per-order
ALTER TABLE customers DROP COLUMN IF EXISTS address_confirmed;

-- Note: We keep customers.address as a "last used" reference for convenience
-- but the actual delivery uses orders.delivery_address
