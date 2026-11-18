-- Run once on the existing D1 database BEFORE deploying the worker that reads school_id.
--   npx wrangler d1 execute noteschallenge-auth --remote --file=migrate-tenancy.sql
-- Do not set NOW. Do not replace secrets. Deploy the worker later with keep_bindings.
--
-- cskphc.edu.mo stays the first tenant, so the current Google login does not move schools.
-- EXTRA_ALLOWED_EMAILS is unchanged. Those accounts stay on cskphc unless
-- EXTRA_ALLOWED_EMAIL_SCHOOLS is set later as email=schoolId pairs (not a secret to commit).
-- Additional schools are extra rows in schools and school_domains. Their domains are
-- allowed in addition to ALLOWED_EMAIL_DOMAINS. Leave ALLOWED_EMAIL_DOMAINS=cskphc.edu.mo.

CREATE TABLE IF NOT EXISTS schools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS school_domains (
  domain TEXT PRIMARY KEY,
  school_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  grade TEXT NOT NULL,
  class TEXT NOT NULL,
  activity TEXT NOT NULL,
  difficulty TEXT,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS classroom_records (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  grade TEXT NOT NULL,
  class TEXT NOT NULL,
  student_name TEXT NOT NULL,
  seat TEXT,
  item TEXT NOT NULL,
  channel TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS paper_entries (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  grade TEXT NOT NULL,
  class TEXT NOT NULL,
  student_name TEXT NOT NULL,
  seat TEXT,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS class_codes (
  code TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  grade TEXT NOT NULL,
  class TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS join_limits (
  key TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  window_start TEXT NOT NULL
);

INSERT OR IGNORE INTO schools (id, name, created_at)
VALUES ('cskphc', 'cskphc.edu.mo', '2026-11-01T00:00:00.000Z');

INSERT OR IGNORE INTO school_domains (domain, school_id)
VALUES ('cskphc.edu.mo', 'cskphc');

ALTER TABLE roster ADD COLUMN school_id TEXT NOT NULL DEFAULT 'cskphc';
