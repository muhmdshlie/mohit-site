-- Mohit Marketing database schema (SQLite)
-- Every statement uses IF NOT EXISTS so it is safe to run on every start.

CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY,
  username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'admin',   -- ready for 'staff' accounts later
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  sid     TEXT    PRIMARY KEY,
  sess    TEXT    NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL            -- stored as JSON
);

CREATE TABLE IF NOT EXISTS brands (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  photo      TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  photo      TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,
  slug        TEXT    NOT NULL UNIQUE,
  brand_id    INTEGER NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  model_code  TEXT    UNIQUE COLLATE NOCASE,          -- NULL allowed; used to match rows on import
  mrp         REAL    NOT NULL CHECK (mrp >= 0),
  nrp         REAL    NOT NULL CHECK (nrp >= 0),
  description TEXT    NOT NULL DEFAULT '',
  specs       TEXT    NOT NULL DEFAULT '',            -- one "Label: value" per line
  photo       TEXT,
  in_stock    INTEGER NOT NULL DEFAULT 1 CHECK (in_stock IN (0,1)),
  featured    INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0,1)),
  is_sample   INTEGER NOT NULL DEFAULT 0 CHECK (is_sample IN (0,1)),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_brand    ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

CREATE TABLE IF NOT EXISTS offers (
  id         INTEGER PRIMARY KEY,
  title      TEXT    NOT NULL,
  text       TEXT    NOT NULL DEFAULT '',
  image      TEXT,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reviews (
  id        INTEGER PRIMARY KEY,
  name      TEXT    NOT NULL,
  place     TEXT    NOT NULL DEFAULT '',
  text      TEXT    NOT NULL,
  stars     INTEGER NOT NULL DEFAULT 5 CHECK (stars BETWEEN 1 AND 5),
  visible   INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0,1)),
  is_sample INTEGER NOT NULL DEFAULT 0 CHECK (is_sample IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS faqs (
  id         INTEGER PRIMARY KEY,
  question   TEXT    NOT NULL,
  answer     TEXT    NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS enquiries (
  id         INTEGER PRIMARY KEY,
  type       TEXT    NOT NULL DEFAULT 'enquiry' CHECK (type IN ('enquiry','quote')),
  name       TEXT    NOT NULL,
  phone      TEXT    NOT NULL,
  message    TEXT    NOT NULL DEFAULT '',
  status     TEXT    NOT NULL DEFAULT 'new' CHECK (status IN ('new','done')),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_enquiries_status ON enquiries(status);
