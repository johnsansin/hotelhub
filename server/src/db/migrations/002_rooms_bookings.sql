-- ============================================================
-- Rooms, rates, guests, bookings, folios, payments
-- ============================================================

CREATE TABLE room_types (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id      uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name          text NOT NULL,
  code          text NOT NULL,
  slug          text,
  description   text,
  short_desc    text,
  base_price    numeric(12,2) NOT NULL DEFAULT 0,
  weekend_price numeric(12,2) NOT NULL DEFAULT 0,
  peak_price    numeric(12,2) NOT NULL DEFAULT 0,
  max_adults    int NOT NULL DEFAULT 2,
  max_children  int NOT NULL DEFAULT 1,
  extra_bed     numeric(12,2) NOT NULL DEFAULT 0,
  bed_type      text DEFAULT 'King',
  size_sqft     int DEFAULT 0,
  total_rooms   int NOT NULL DEFAULT 0,
  amenities     jsonb NOT NULL DEFAULT '[]',
  images        jsonb NOT NULL DEFAULT '[]',
  image         text,
  sort_order    int NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, code)
);

CREATE TABLE rooms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id      uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  room_type_id  uuid REFERENCES room_types(id) ON DELETE SET NULL,
  number        text NOT NULL,
  floor         text,
  view          text DEFAULT 'City',
  status        text NOT NULL DEFAULT 'available'
                CHECK (status IN ('available','occupied','cleaning','maintenance','blocked','out_of_order')),
  housekeeping  text NOT NULL DEFAULT 'clean' CHECK (housekeeping IN ('clean','dirty','inspected','in_progress')),
  features      jsonb NOT NULL DEFAULT '[]',
  is_active     boolean NOT NULL DEFAULT true,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, number)
);
CREATE INDEX rooms_hotel_status_idx ON rooms (hotel_id, status);

CREATE TABLE rate_seasons (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id     uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  room_type_id uuid NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
  name         text NOT NULL,
  start_date   date NOT NULL,
  end_date     date NOT NULL,
  price        numeric(12,2) NOT NULL,
  min_stay     int NOT NULL DEFAULT 1,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE room_blocks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id   uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  room_id    uuid REFERENCES rooms(id) ON DELETE CASCADE,
  room_type_id uuid REFERENCES room_types(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date   date NOT NULL,
  reason     text NOT NULL DEFAULT 'Maintenance',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE guests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id     uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  first_name   text NOT NULL,
  last_name    text,
  email        text,
  phone        text,
  nationality  text,
  country      text,
  id_type      text DEFAULT 'Passport',
  id_number    text,
  address      text,
  city         text,
  dob          date,
  gender       text,
  vip_tier     text NOT NULL DEFAULT 'standard'
               CHECK (vip_tier IN ('standard','silver','gold','platinum')),
  notes        text,
  tags         jsonb NOT NULL DEFAULT '[]',
  total_stays  int NOT NULL DEFAULT 0,
  total_spent  numeric(12,2) NOT NULL DEFAULT 0,
  is_blacklisted boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX guests_hotel_name_idx ON guests (hotel_id, first_name);

CREATE TABLE bookings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id       uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  code           text NOT NULL,
  guest_id       uuid REFERENCES guests(id) ON DELETE SET NULL,
  room_type_id   uuid REFERENCES room_types(id) ON DELETE SET NULL,
  room_id        uuid REFERENCES rooms(id) ON DELETE SET NULL,
  check_in       date NOT NULL,
  check_out      date NOT NULL,
  nights         int NOT NULL DEFAULT 1,
  adults         int NOT NULL DEFAULT 1,
  children       int NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'confirmed'
                 CHECK (status IN ('pending','confirmed','checked_in','checked_out','cancelled','no_show')),
  source         text NOT NULL DEFAULT 'website'
                 CHECK (source IN ('website','walk_in','phone','email','ota','corporate','agent','reception')),
  rate           numeric(12,2) NOT NULL DEFAULT 0,     -- per night
  subtotal       numeric(12,2) NOT NULL DEFAULT 0,
  discount       numeric(12,2) NOT NULL DEFAULT 0,
  tax            numeric(12,2) NOT NULL DEFAULT 0,
  total_amount   numeric(12,2) NOT NULL DEFAULT 0,
  paid_amount    numeric(12,2) NOT NULL DEFAULT 0,
  advance        numeric(12,2) NOT NULL DEFAULT 0,
  coupon_code    text,
  currency       text DEFAULT 'INR',
  guest_name     text,                                  -- denormalised for quick list
  guest_email    text,
  guest_phone    text,
  special_requests text,
  notes          text,
  internal_notes text,
  room_number    text,
  checked_in_at  timestamptz,
  checked_out_at timestamptz,
  cancelled_at   timestamptz,
  cancel_reason  text,
  confirmation_sent boolean NOT NULL DEFAULT false,
  created_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (check_out > check_in)
);
CREATE INDEX bookings_hotel_dates_idx ON bookings (hotel_id, check_in, check_out);
CREATE INDEX bookings_hotel_status_idx ON bookings (hotel_id, status);
CREATE INDEX bookings_code_idx ON bookings (code);

CREATE TABLE booking_guests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  name        text NOT NULL,
  relation    text DEFAULT 'Guest',
  id_type     text,
  id_number   text,
  phone       text,
  age         int,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE booking_logs (
  id         bigserial PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  hotel_id   uuid,
  action     text NOT NULL,
  detail     text,
  actor_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE coupons (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id    uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  code        text NOT NULL,
  description text,
  type        text NOT NULL DEFAULT 'percent' CHECK (type IN ('percent','flat')),
  value       numeric(12,2) NOT NULL DEFAULT 0,
  min_stay    int NOT NULL DEFAULT 1,
  min_amount  numeric(12,2) NOT NULL DEFAULT 0,
  max_uses    int NOT NULL DEFAULT 100,
  used_count  int NOT NULL DEFAULT 0,
  valid_from  date,
  valid_to    date,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, code)
);

-- ---------- Folio / invoicing ----------
CREATE TABLE invoices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id     uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  booking_id   uuid REFERENCES bookings(id) ON DELETE SET NULL,
  order_id     uuid,                                  -- FK added later (orders table)
  invoice_no   text NOT NULL,
  type         text NOT NULL DEFAULT 'stay' CHECK (type IN ('stay','pos','event','service')),
  party_name   text,
  party_email  text,
  party_phone  text,
  issue_date   date NOT NULL DEFAULT CURRENT_DATE,
  due_date     date,
  sub_total    numeric(12,2) NOT NULL DEFAULT 0,
  discount     numeric(12,2) NOT NULL DEFAULT 0,
  tax          numeric(12,2) NOT NULL DEFAULT 0,
  round_off    numeric(12,2) NOT NULL DEFAULT 0,
  total        numeric(12,2) NOT NULL DEFAULT 0,
  paid         numeric(12,2) NOT NULL DEFAULT 0,
  status       text NOT NULL DEFAULT 'unpaid'
               CHECK (status IN ('draft','unpaid','partial','paid','void')),
  notes        text,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, invoice_no)
);

CREATE TABLE invoice_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  hotel_id    uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  description text NOT NULL,
  category    text NOT NULL DEFAULT 'other'
              CHECK (category IN ('room','restaurant','laundry','minibar','spa','transport','event','other')),
  qty         numeric(10,2) NOT NULL DEFAULT 1,
  rate        numeric(12,2) NOT NULL DEFAULT 0,
  amount      numeric(12,2) NOT NULL DEFAULT 0,
  tax         numeric(12,2) NOT NULL DEFAULT 0,
  ref_id      uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id    uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  invoice_id  uuid REFERENCES invoices(id) ON DELETE SET NULL,
  booking_id  uuid REFERENCES bookings(id) ON DELETE SET NULL,
  amount      numeric(12,2) NOT NULL,
  method      text NOT NULL DEFAULT 'cash'
              CHECK (method IN ('cash','card','upi','bank_transfer','cheque','wallet','online','other')),
  reference   text,
  direction   text NOT NULL DEFAULT 'in' CHECK (direction IN ('in','out')),
  category    text NOT NULL DEFAULT 'guest',
  notes       text,
  paid_at     timestamptz NOT NULL DEFAULT now(),
  received_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_hotel_date_idx ON payments (hotel_id, paid_at);

-- ---------- Reviews ----------
CREATE TABLE reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id    uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  booking_id  uuid REFERENCES bookings(id) ON DELETE SET NULL,
  guest_name  text NOT NULL,
  rating      int NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  category    text NOT NULL DEFAULT 'overall',
  comment     text,
  response    text,
  is_published boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------- Events / banquets ----------
CREATE TABLE event_bookings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id     uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  title        text NOT NULL,
  venue        text,
  client_name  text,
  client_email text,
  client_phone text,
  start_at     timestamptz NOT NULL,
  end_at       timestamptz NOT NULL,
  pax          int NOT NULL DEFAULT 50,
  event_type   text NOT NULL DEFAULT 'banquet',
  status       text NOT NULL DEFAULT 'enquiry'
               CHECK (status IN ('enquiry','confirmed','completed','cancelled')),
  rate         numeric(12,2) NOT NULL DEFAULT 0,
  advance      numeric(12,2) NOT NULL DEFAULT 0,
  notes        text,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
