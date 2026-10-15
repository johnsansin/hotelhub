-- ============================================================
-- Restaurant / POS, accounting, AI
-- ============================================================

-- ---------- Restaurant ----------
CREATE TABLE menu_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id   uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name       text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE menu_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id     uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  category_id  uuid REFERENCES menu_categories(id) ON DELETE SET NULL,
  name         text NOT NULL,
  description  text,
  price        numeric(12,2) NOT NULL DEFAULT 0,
  cost         numeric(12,2) NOT NULL DEFAULT 0,
  code         text,
  image        text,
  is_veg       boolean NOT NULL DEFAULT false,
  is_available boolean NOT NULL DEFAULT true,
  prep_time    int NOT NULL DEFAULT 15,
  taxes        numeric(6,2) NOT NULL DEFAULT 5,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE restaurant_tables (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id   uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name       text NOT NULL,
  area       text DEFAULT 'Indoor',
  seats      int NOT NULL DEFAULT 4,
  status     text NOT NULL DEFAULT 'free'
             CHECK (status IN ('free','occupied','reserved','blocked')),
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, name)
);

CREATE TABLE orders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id     uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  order_no     text NOT NULL,
  type         text NOT NULL DEFAULT 'dine_in'
               CHECK (type IN ('dine_in','takeaway','delivery','room_service')),
  table_id     uuid REFERENCES restaurant_tables(id) ON DELETE SET NULL,
  booking_id   uuid REFERENCES bookings(id) ON DELETE SET NULL,
  room_number  text,
  guest_name   text,
  status       text NOT NULL DEFAULT 'new'
               CHECK (status IN ('new','confirmed','preparing','ready','served','bill_generated','paid','cancelled')),
  persons      int NOT NULL DEFAULT 1,
  sub_total    numeric(12,2) NOT NULL DEFAULT 0,
  discount     numeric(12,2) NOT NULL DEFAULT 0,
  tax          numeric(12,2) NOT NULL DEFAULT 0,
  total        numeric(12,2) NOT NULL DEFAULT 0,
  paid         numeric(12,2) NOT NULL DEFAULT 0,
  payment_method text,
  notes        text,
  kot_printed  boolean NOT NULL DEFAULT false,
  served_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, order_no)
);

CREATE TABLE order_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  hotel_id     uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  menu_item_id uuid REFERENCES menu_items(id) ON DELETE SET NULL,
  name         text NOT NULL,
  qty          numeric(10,2) NOT NULL DEFAULT 1,
  price        numeric(12,2) NOT NULL DEFAULT 0,
  cost         numeric(12,2) NOT NULL DEFAULT 0,
  discount     numeric(12,2) NOT NULL DEFAULT 0,
  tax          numeric(12,2) NOT NULL DEFAULT 0,
  amount       numeric(12,2) NOT NULL DEFAULT 0,
  notes        text,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','preparing','ready','served','cancelled')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------- Retail / counter sales ----------
CREATE TABLE sales (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id       uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  invoice_no     text NOT NULL,
  outlet         text NOT NULL DEFAULT 'reception'
                 CHECK (outlet IN ('reception','shop','spa','laundry','transport','minibar')),
  customer_name  text,
  customer_phone text,
  sub_total      numeric(12,2) NOT NULL DEFAULT 0,
  discount       numeric(12,2) NOT NULL DEFAULT 0,
  tax            numeric(12,2) NOT NULL DEFAULT 0,
  total          numeric(12,2) NOT NULL DEFAULT 0,
  paid           numeric(12,2) NOT NULL DEFAULT 0,
  payment_method text DEFAULT 'cash',
  status         text NOT NULL DEFAULT 'paid'
                 CHECK (status IN ('unpaid','partial','paid','void')),
  notes          text,
  sold_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  sold_at        timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, invoice_no)
);

CREATE TABLE sale_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id     uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  hotel_id    uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  item_id     uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  name        text NOT NULL,
  qty         numeric(10,2) NOT NULL DEFAULT 1,
  rate        numeric(12,2) NOT NULL DEFAULT 0,
  amount      numeric(12,2) NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------- Accounts ----------
CREATE TABLE accounts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id   uuid REFERENCES hotels(id) ON DELETE CASCADE,   -- NULL => platform template
  code       text NOT NULL,
  name       text NOT NULL,
  type       text NOT NULL CHECK (type IN ('asset','liability','equity','income','expense')),
  group_name text NOT NULL DEFAULT 'Other',
  parent_id  uuid REFERENCES accounts(id) ON DELETE SET NULL,
  is_system  boolean NOT NULL DEFAULT false,
  balance    numeric(14,2) NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX accounts_hotel_idx ON accounts (hotel_id, code);

CREATE TABLE journal_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id    uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  entry_no    text NOT NULL,
  entry_date  date NOT NULL DEFAULT CURRENT_DATE,
  ref_type    text,        -- invoice | payment | expense | purchase | manual
  ref_id      uuid,
  memo        text,
  total_debit numeric(14,2) NOT NULL DEFAULT 0,
  total_credit numeric(14,2) NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'posted' CHECK (status IN ('draft','posted','void')),
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE journal_lines (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id   uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  hotel_id   uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  debit      numeric(14,2) NOT NULL DEFAULT 0,
  credit     numeric(14,2) NOT NULL DEFAULT 0,
  memo       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX journal_lines_entry_idx ON journal_lines (entry_id);

CREATE TABLE expenses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id      uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  expense_no    text NOT NULL,
  category      text NOT NULL DEFAULT 'general',
  account_id    uuid REFERENCES accounts(id) ON DELETE SET NULL,
  title         text NOT NULL,
  vendor        text,
  amount        numeric(12,2) NOT NULL DEFAULT 0,
  tax           numeric(12,2) NOT NULL DEFAULT 0,
  total         numeric(12,2) NOT NULL DEFAULT 0,
  expense_date  date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text DEFAULT 'cash',
  status        text NOT NULL DEFAULT 'paid' CHECK (status IN ('unpaid','partial','paid')),
  notes         text,
  attachment    text,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, expense_no)
);

-- ---------- AI assistant ----------
CREATE TABLE ai_conversations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id   uuid REFERENCES hotels(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES users(id) ON DELETE CASCADE,
  title      text NOT NULL DEFAULT 'New conversation',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ai_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES ai_conversations(id) ON DELETE CASCADE,
  hotel_id   uuid REFERENCES hotels(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('user','assistant','system')),
  content    text NOT NULL,
  meta       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_messages_conv_idx ON ai_messages (conversation_id, created_at);

-- invoice -> order FK (orders exists now)
ALTER TABLE invoices ADD CONSTRAINT invoices_order_fk
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;

-- updated_at triggers for all tables created in this file
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_trg ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_trg BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;
