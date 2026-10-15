-- ============================================================
-- HotelHub SaaS — Core / tenancy / auth
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- ---------- Platform plans ----------
CREATE TABLE plans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text UNIQUE NOT NULL,
  name          text NOT NULL,
  tagline       text,
  price_monthly numeric(10,2) NOT NULL DEFAULT 0,
  price_yearly  numeric(10,2) NOT NULL DEFAULT 0,
  max_rooms     int NOT NULL DEFAULT 0,      -- 0 = unlimited
  max_staff     int NOT NULL DEFAULT 0,
  max_orders_month int NOT NULL DEFAULT 0,
  features      jsonb NOT NULL DEFAULT '[]',
  highlights    jsonb NOT NULL DEFAULT '[]',
  is_popular    boolean NOT NULL DEFAULT false,
  sort_order    int NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------- Hotels (tenants) ----------
CREATE TABLE hotels (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           text UNIQUE NOT NULL,
  name           text NOT NULL,
  legal_name     text,
  tagline        text,
  description    text,
  email          text NOT NULL,
  phone          text,
  website        text,
  address        text,
  city           text,
  state          text,
  country        text DEFAULT 'India',
  zip            text,
  timezone       text DEFAULT 'Asia/Kolkata',
  currency       text DEFAULT 'INR',
  currency_symbol text DEFAULT '₹',
  locale         text DEFAULT 'en',
  logo_url       text,
  cover_url      text,
  star_rating    int NOT NULL DEFAULT 3,
  check_in_time  time NOT NULL DEFAULT '14:00',
  check_out_time time NOT NULL DEFAULT '11:00',
  tax_rate       numeric(6,2) NOT NULL DEFAULT 12,
  service_charge numeric(6,2) NOT NULL DEFAULT 0,
  amenities      jsonb NOT NULL DEFAULT '[]',
  gallery        jsonb NOT NULL DEFAULT '[]',
  policies       jsonb NOT NULL DEFAULT '{}',
  social         jsonb NOT NULL DEFAULT '{}',
  about          text,
  settings       jsonb NOT NULL DEFAULT '{}',
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','active','trial','suspended')),
  plan_id        uuid REFERENCES plans(id),
  trial_ends_at  timestamptz,
  onboard_step   int NOT NULL DEFAULT 0,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------- Users ----------
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id      uuid REFERENCES hotels(id) ON DELETE CASCADE,   -- NULL => platform user
  role          text NOT NULL DEFAULT 'staff'
                CHECK (role IN ('superadmin','admin','manager','receptionist',
                                'housekeeper','accountant','storekeeper','restaurant','staff')),
  name          text NOT NULL,
  email         text NOT NULL,
  phone         text,
  password_hash text NOT NULL,
  avatar_url    text,
  designation   text,
  is_active     boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

-- ---------- Subscriptions ----------
CREATE TABLE subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id      uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  plan_id       uuid NOT NULL REFERENCES plans(id),
  billing_cycle text NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly','yearly')),
  status        text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','trialing','past_due','cancelled','expired')),
  amount        numeric(12,2) NOT NULL DEFAULT 0,
  starts_at     timestamptz NOT NULL DEFAULT now(),
  ends_at       timestamptz,
  paid_via      text,
  reference     text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------- Platform settings ----------
CREATE TABLE platform_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- Audit log ----------
CREATE TABLE audit_logs (
  id         bigserial PRIMARY KEY,
  hotel_id   uuid REFERENCES hotels(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  action     text NOT NULL,
  entity     text,
  entity_id  text,
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip         text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_hotel_idx ON audit_logs (hotel_id, created_at DESC);

-- ---------- Notifications ----------
CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id   uuid REFERENCES hotels(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES users(id) ON DELETE CASCADE,
  title      text NOT NULL,
  message    text NOT NULL,
  type       text NOT NULL DEFAULT 'info'
             CHECK (type IN ('info','success','warning','error','booking','stock','payment')),
  link       text,
  is_read    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_hotel_idx ON notifications (hotel_id, created_at DESC);

-- ---------- Support tickets ----------
CREATE TABLE support_tickets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id    uuid REFERENCES hotels(id) ON DELETE CASCADE,
  subject     text NOT NULL,
  category    text NOT NULL DEFAULT 'general',
  priority    text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ticket_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  author_role text,
  message    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- updated_at triggers
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_trg ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_trg BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;
