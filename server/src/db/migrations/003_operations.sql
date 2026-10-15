-- ============================================================
-- Front office ops, staff, inventory & procurement
-- ============================================================

-- ---------- Housekeeping ----------
CREATE TABLE housekeeping_tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id     uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  room_id      uuid REFERENCES rooms(id) ON DELETE CASCADE,
  booking_id   uuid REFERENCES bookings(id) ON DELETE SET NULL,
  type         text NOT NULL DEFAULT 'clean'
               CHECK (type IN ('clean','deep_clean','inspect','towel_change','turndown','maintenance')),
  priority     text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','in_progress','done','cancelled')),
  assigned_to  uuid REFERENCES users(id) ON DELETE SET NULL,
  notes        text,
  due_at       timestamptz,
  started_at   timestamptz,
  completed_at timestamptz,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE maintenance_tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id     uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  room_id      uuid REFERENCES rooms(id) ON DELETE SET NULL,
  title        text NOT NULL,
  description  text,
  category     text NOT NULL DEFAULT 'general',
  priority     text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status       text NOT NULL DEFAULT 'open'
               CHECK (status IN ('open','in_progress','on_hold','resolved','closed')),
  cost         numeric(12,2) NOT NULL DEFAULT 0,
  vendor       text,
  assigned_to  uuid REFERENCES users(id) ON DELETE SET NULL,
  reported_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  due_date     date,
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE found_lost_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id     uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  item_name    text NOT NULL,
  description  text,
  category     text NOT NULL DEFAULT 'other',
  location     text,
  found_date   date NOT NULL DEFAULT CURRENT_DATE,
  found_by     text,
  value        numeric(12,2) NOT NULL DEFAULT 0,
  status       text NOT NULL DEFAULT 'found'
               CHECK (status IN ('found','stored','claimed','returned','disposed','donated')),
  guest_name   text,
  booking_id   uuid REFERENCES bookings(id) ON DELETE SET NULL,
  claimant     text,
  claim_date   date,
  image        text,
  notes        text,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------- Staff / HR ----------
CREATE TABLE shifts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id   uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name       text NOT NULL,
  start_time time NOT NULL DEFAULT '09:00',
  end_time   time NOT NULL DEFAULT '18:00',
  grace_min  int NOT NULL DEFAULT 10,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE staff_profiles (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id         uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  user_id          uuid REFERENCES users(id) ON DELETE CASCADE,
  employee_code    text,
  department       text NOT NULL DEFAULT 'Front Office',
  designation      text,
  shift_id         uuid REFERENCES shifts(id) ON DELETE SET NULL,
  join_date        date NOT NULL DEFAULT CURRENT_DATE,
  exit_date        date,
  salary           numeric(12,2) NOT NULL DEFAULT 0,
  gender           text,
  dob              date,
  blood_group      text,
  address          text,
  emergency_name   text,
  emergency_phone  text,
  id_proof         text,
  bank_account     text,
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_leave','probation','terminated')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE attendance (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id    uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  staff_id    uuid NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
  work_date   date NOT NULL DEFAULT CURRENT_DATE,
  status      text NOT NULL DEFAULT 'present'
              CHECK (status IN ('present','absent','late','half_day','leave','holiday','on_duty')),
  check_in    timestamptz,
  check_out   timestamptz,
  hours       numeric(5,2) NOT NULL DEFAULT 0,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, work_date)
);

CREATE TABLE leave_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id    uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  staff_id    uuid NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
  type        text NOT NULL DEFAULT 'casual' CHECK (type IN ('casual','sick','paid','unpaid','other')),
  from_date   date NOT NULL,
  to_date     date NOT NULL,
  reason      text,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payroll (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id     uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  staff_id     uuid NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
  period       text NOT NULL,                 -- e.g. 2026-10
  basic        numeric(12,2) NOT NULL DEFAULT 0,
  allowances   numeric(12,2) NOT NULL DEFAULT 0,
  bonus        numeric(12,2) NOT NULL DEFAULT 0,
  deductions   numeric(12,2) NOT NULL DEFAULT 0,
  net_pay      numeric(12,2) NOT NULL DEFAULT 0,
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid')),
  paid_at      timestamptz,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, period)
);

-- ---------- Inventory & procurement ----------
CREATE TABLE suppliers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id     uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name         text NOT NULL,
  contact_name text,
  phone        text,
  email        text,
  address      text,
  city         text,
  gst_no       text,
  payment_terms text,
  categories   jsonb NOT NULL DEFAULT '[]',
  notes        text,
  is_active    boolean NOT NULL DEFAULT true,
  total_dues   numeric(12,2) NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inventory_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id   uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name       text NOT NULL,
  parent_id  uuid REFERENCES inventory_categories(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inventory_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id      uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name          text NOT NULL,
  sku           text NOT NULL,
  category_id   uuid REFERENCES inventory_categories(id) ON DELETE SET NULL,
  unit          text NOT NULL DEFAULT 'pcs',
  stock_qty     numeric(12,2) NOT NULL DEFAULT 0,
  reorder_level numeric(12,2) NOT NULL DEFAULT 10,
  cost_price    numeric(12,2) NOT NULL DEFAULT 0,
  sell_price    numeric(12,2) NOT NULL DEFAULT 0,
  supplier_id   uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  location      text,
  expiry_date   date,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, sku)
);

CREATE TABLE stock_movements (
  id          bigserial PRIMARY KEY,
  hotel_id    uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  item_id     uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('in','out','adjustment','transfer','return')),
  qty         numeric(12,2) NOT NULL,
  ref_type    text,          -- purchase_order | sale | order | manual
  ref_id      text,
  note        text,
  unit_cost   numeric(12,2),
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_movements_hotel_idx ON stock_movements (hotel_id, created_at DESC);

CREATE TABLE purchase_orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id      uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  po_no         text NOT NULL,
  supplier_id   uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  order_date    date NOT NULL DEFAULT CURRENT_DATE,
  expected_date date,
  status        text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','sent','partial','received','cancelled')),
  sub_total     numeric(12,2) NOT NULL DEFAULT 0,
  tax           numeric(12,2) NOT NULL DEFAULT 0,
  discount      numeric(12,2) NOT NULL DEFAULT 0,
  total         numeric(12,2) NOT NULL DEFAULT 0,
  paid         numeric(12,2) NOT NULL DEFAULT 0,
  notes         text,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, po_no)
);

CREATE TABLE purchase_order_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id        uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  hotel_id     uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  item_id      uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  name         text NOT NULL,
  qty          numeric(12,2) NOT NULL DEFAULT 1,
  received_qty numeric(12,2) NOT NULL DEFAULT 0,
  rate         numeric(12,2) NOT NULL DEFAULT 0,
  amount       numeric(12,2) NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
