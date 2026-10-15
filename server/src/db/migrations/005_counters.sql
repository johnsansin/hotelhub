-- document numbering counters
CREATE TABLE doc_counters (
  hotel_id uuid NOT NULL,
  kind    text NOT NULL,
  value   bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (hotel_id, kind)
);

-- per-hotel feature modules (toggles)
CREATE TABLE hotel_modules (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id   uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  module     text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  config     jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (hotel_id, module)
);
