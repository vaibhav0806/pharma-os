-- Initial database schema for Pharma-OS

-- Extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Pharmacies table
CREATE TABLE pharmacies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL UNIQUE,
    whatsapp_number VARCHAR(20) NOT NULL,
    address TEXT,
    upi_id VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pharmacy users (for dashboard login)
CREATE TABLE pharmacy_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'staff',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Customers (WhatsApp users)
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(255),
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Order status enum
CREATE TYPE order_status AS ENUM (
    'pending',
    'awaiting_rx',
    'rx_received',
    'under_review',
    'confirmed',
    'awaiting_payment',
    'payment_confirmed',
    'ready_for_pickup',
    'completed',
    'cancelled'
);

-- Payment method enum
CREATE TYPE payment_method AS ENUM ('upi', 'cod');

-- Orders table
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(20) NOT NULL UNIQUE,
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id),
    customer_id UUID NOT NULL REFERENCES customers(id),
    status order_status DEFAULT 'pending',
    raw_message TEXT NOT NULL,
    parsed_items JSONB,
    requires_rx BOOLEAN DEFAULT false,
    rx_verified BOOLEAN DEFAULT false,
    payment_method payment_method,
    total_amount DECIMAL(10, 2),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Order items (populated after pharmacist review)
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(10, 2),
    requires_rx BOOLEAN DEFAULT false,
    is_available BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Prescriptions (uploaded images)
CREATE TABLE prescriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id),
    media_url TEXT NOT NULL,
    media_type VARCHAR(50),
    twilio_media_sid VARCHAR(50),
    is_valid BOOLEAN,
    verified_by UUID REFERENCES pharmacy_users(id),
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Message log (audit trail)
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id),
    customer_id UUID REFERENCES customers(id),
    pharmacy_id UUID REFERENCES pharmacies(id),
    direction VARCHAR(10) NOT NULL,
    twilio_sid VARCHAR(50),
    from_number VARCHAR(20) NOT NULL,
    to_number VARCHAR(20) NOT NULL,
    body TEXT,
    media_url TEXT,
    status VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Order status history (audit trail)
CREATE TABLE order_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status order_status,
    to_status order_status NOT NULL,
    changed_by UUID REFERENCES pharmacy_users(id),
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_orders_pharmacy_status ON orders(pharmacy_id, status);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_messages_order ON messages(order_id);
CREATE INDEX idx_messages_created ON messages(created_at DESC);
CREATE INDEX idx_prescriptions_order ON prescriptions(order_id);
CREATE INDEX idx_pharmacy_users_email ON pharmacy_users(email);
CREATE INDEX idx_pharmacy_users_pharmacy ON pharmacy_users(pharmacy_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_pharmacies_updated_at BEFORE UPDATE ON pharmacies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
