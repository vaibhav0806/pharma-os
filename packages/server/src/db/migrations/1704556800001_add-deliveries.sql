-- Add deliveries table for Borzo integration

-- Delivery status enum
CREATE TYPE delivery_status AS ENUM (
    'pending',           -- Not yet booked
    'calculating',       -- Calculating price
    'quoted',            -- Price calculated, awaiting confirmation
    'booked',            -- Order placed with Borzo
    'courier_assigned',  -- Courier picked up the task
    'in_transit',        -- Courier is delivering
    'delivered',         -- Successfully delivered
    'cancelled',         -- Delivery cancelled
    'failed'             -- Delivery failed
);

-- Deliveries table
CREATE TABLE deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id),
    customer_id UUID NOT NULL REFERENCES customers(id),

    -- Borzo order details
    borzo_order_id VARCHAR(50),
    borzo_order_number VARCHAR(50),
    tracking_url TEXT,

    -- Status
    status delivery_status DEFAULT 'pending',

    -- Addresses
    pickup_address TEXT NOT NULL,
    pickup_phone VARCHAR(20) NOT NULL,
    pickup_contact_name VARCHAR(255),

    delivery_address TEXT NOT NULL,
    delivery_phone VARCHAR(20) NOT NULL,
    delivery_contact_name VARCHAR(255),

    -- Pricing
    estimated_price DECIMAL(10, 2),
    final_price DECIMAL(10, 2),
    currency VARCHAR(3) DEFAULT 'INR',

    -- Courier info
    courier_name VARCHAR(255),
    courier_phone VARCHAR(20),

    -- Timestamps
    booked_at TIMESTAMP WITH TIME ZONE,
    picked_up_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add delivery_id to orders table
ALTER TABLE orders ADD COLUMN delivery_id UUID REFERENCES deliveries(id);

-- Add customer address collection status
ALTER TABLE customers ADD COLUMN address_confirmed BOOLEAN DEFAULT false;

-- Add pharmacy address for pickup
ALTER TABLE pharmacies ADD COLUMN pickup_address TEXT;
ALTER TABLE pharmacies ADD COLUMN contact_name VARCHAR(255);

-- Indexes
CREATE INDEX idx_deliveries_order ON deliveries(order_id);
CREATE INDEX idx_deliveries_status ON deliveries(status);
CREATE INDEX idx_deliveries_borzo_order ON deliveries(borzo_order_id);

-- Trigger for updated_at
CREATE TRIGGER update_deliveries_updated_at BEFORE UPDATE ON deliveries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
