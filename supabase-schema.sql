CREATE TABLE orders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  platform text NOT NULL CHECK (platform IN ('Shopee', 'TikTok Shop')),
  order_id text UNIQUE NOT NULL,
  revenue numeric(12,2) DEFAULT 0,
  cogs numeric(12,2) DEFAULT 0,
  shipping_fee numeric(12,2) DEFAULT 0,
  platform_fee numeric(12,2) DEFAULT 0,
  ad_spend numeric(12,2) DEFAULT 0,
  net_profit numeric(12,2) DEFAULT 0,
  status text DEFAULT 'completed',
  created_at timestamptz DEFAULT now(),
  paid_at timestamptz
);

CREATE TABLE products (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  platform text NOT NULL,
  product_id text NOT NULL,
  name text NOT NULL,
  sku text,
  cogs_per_unit numeric(12,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE expenses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL,
  amount numeric(12,2) NOT NULL,
  description text,
  platform text,
  date date NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE ad_spend (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  platform text NOT NULL,
  campaign_name text,
  amount numeric(12,2) NOT NULL,
  date date NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_orders_platform ON orders(platform);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_orders_order_id ON orders(order_id);
