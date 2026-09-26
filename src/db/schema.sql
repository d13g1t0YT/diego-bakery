-- Diego Bakery Database Schema
-- Spanish UI backend with offline-first sync support

-- Admin sessions (phone/PIN/biometric ready)
CREATE TABLE IF NOT EXISTS admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) NOT NULL,
  pin_hash VARCHAR(255) NOT NULL,
  biometric_enabled BOOLEAN DEFAULT false,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(phone_number)
);

-- Products (pan, pastry, bread, etc.)
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  sku VARCHAR(100),
  unit VARCHAR(50),
  price DECIMAL(10, 2) NOT NULL,
  cost DECIMAL(10, 2),
  profit DECIMAL(10, 2),
  margin_percent DECIMAL(5, 2),
  category VARCHAR(100),
  active BOOLEAN DEFAULT true,
  sync_version INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ingredients (flour, sugar, salt, etc.)
CREATE TABLE IF NOT EXISTS ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  unit VARCHAR(50),
  unit_cost DECIMAL(10, 2) NOT NULL,
  packaging_cost DECIMAL(10, 2),
  supplier VARCHAR(255),
  active BOOLEAN DEFAULT true,
  sync_version INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Recipes (mappings: product -> ingredients with quantities)
CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  ingredient_id UUID NOT NULL REFERENCES ingredients(id),
  quantity DECIMAL(10, 4) NOT NULL,
  unit VARCHAR(50),
  sync_version INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, ingredient_id)
);

-- Auto-calculated recipe costs (denormalized for efficiency)
CREATE TABLE IF NOT EXISTS recipe_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL UNIQUE REFERENCES products(id),
  ingredient_cost DECIMAL(10, 2),
  packaging_cost DECIMAL(10, 2),
  utilities_cost DECIMAL(10, 2),
  labor_cost DECIMAL(10, 2),
  total_cost DECIMAL(10, 2),
  base_price DECIMAL(10, 2),
  profit DECIMAL(10, 2),
  margin_percent DECIMAL(5, 2),
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inventory (stock tracking)
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id UUID NOT NULL REFERENCES ingredients(id),
  quantity DECIMAL(10, 4) NOT NULL,
  reorder_level DECIMAL(10, 4),
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inventory movements (audit trail)
CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id UUID NOT NULL REFERENCES ingredients(id),
  movement_type VARCHAR(50) NOT NULL, -- 'purchase', 'usage', 'waste', 'adjustment'
  quantity DECIMAL(10, 4) NOT NULL,
  reference_id UUID,
  notes TEXT,
  sync_version INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  surname VARCHAR(255),
  phone VARCHAR(20),
  address TEXT,
  reference TEXT,
  balance DECIMAL(10, 2) DEFAULT 0, -- for credit tracking
  active BOOLEAN DEFAULT true,
  sync_version INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id),
  order_date DATE NOT NULL,
  required_date DATE,
  status VARCHAR(50) NOT NULL, -- pending, awaiting_confirmation, buying_ingredients, preparing, ready, to_deliver, delivered, not_delivered, canceled
  total DECIMAL(10, 2),
  notes TEXT,
  sync_version INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Order items
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INT NOT NULL,
  unit_price DECIMAL(10, 2),
  subtotal DECIMAL(10, 2),
  sync_version INT DEFAULT 0
);

-- Payments (Yape, Plin, cash)
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  amount DECIMAL(10, 2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL, -- 'yape', 'plin', 'cash'
  yape_reference VARCHAR(255),
  plin_reference VARCHAR(255),
  cash_proof_url VARCHAR(255),
  admin_confirmed BOOLEAN DEFAULT false,
  sync_version INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(100),
  description TEXT,
  amount DECIMAL(10, 2) NOT NULL,
  expense_date DATE NOT NULL,
  sync_version INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Investments/Capital
CREATE TABLE IF NOT EXISTS investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT,
  amount DECIMAL(10, 2) NOT NULL,
  investment_date DATE NOT NULL,
  sync_version INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Debts (receivable/payable)
CREATE TABLE IF NOT EXISTS debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debtor_type VARCHAR(50) NOT NULL, -- 'customer' or 'supplier'
  debtor_id UUID,
  amount DECIMAL(10, 2) NOT NULL,
  description TEXT,
  due_date DATE,
  status VARCHAR(50) DEFAULT 'pending', -- pending, paid, partial
  debt_date DATE NOT NULL,
  sync_version INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Losses/Waste
CREATE TABLE IF NOT EXISTS losses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id),
  ingredient_id UUID REFERENCES ingredients(id),
  quantity DECIMAL(10, 4),
  reason VARCHAR(255),
  loss_value DECIMAL(10, 2),
  loss_date DATE NOT NULL,
  sync_version INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Promotions/Coupons
CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) UNIQUE,
  discount_type VARCHAR(50), -- 'fixed', 'percent'
  discount_value DECIMAL(10, 2),
  start_date DATE NOT NULL,
  end_date DATE,
  active BOOLEAN DEFAULT true,
  sync_version INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Loyalty program
CREATE TABLE IF NOT EXISTS loyalty_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL UNIQUE REFERENCES customers(id),
  points INT DEFAULT 0,
  tier VARCHAR(50) DEFAULT 'bronze', -- bronze, silver, gold
  total_spent DECIMAL(10, 2) DEFAULT 0,
  sync_version INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sales (daily summaries)
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_date DATE NOT NULL UNIQUE,
  total_revenue DECIMAL(10, 2),
  total_orders INT,
  average_order DECIMAL(10, 2),
  sync_version INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sync metadata (for offline-first clients)
CREATE TABLE IF NOT EXISTS sync_metadata (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(100) NOT NULL,
  last_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  version INT DEFAULT 0
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date);
CREATE INDEX IF NOT EXISTS idx_recipes_product ON recipes(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_ingredient ON inventory(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_debts_status ON debts(status);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_ingredient ON inventory_movements(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_customer ON loyalty_members(customer_id);

