-- D1 schema for noteschallenge web sign-in.
-- Apply once: wrangler d1 execute noteschallenge-auth --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS users (
  sub TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  picture TEXT,
  grade TEXT,
  class TEXT,
  student_name TEXT,
  created_at TEXT NOT NULL,
  last_login TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  sub TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- School roster. Filled out of band (not from the public site). Email is the Google account.
CREATE TABLE IF NOT EXISTS roster (
  email TEXT PRIMARY KEY,
  grade TEXT NOT NULL,
  class TEXT NOT NULL,
  student_name TEXT NOT NULL,
  seat TEXT,
  updated_at TEXT NOT NULL
);

-- Who is on the site right now. Idle rows are removed by the worker.
CREATE TABLE IF NOT EXISTS presence (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  display_name TEXT NOT NULL,
  class_label TEXT,
  screen TEXT,
  last_seen TEXT NOT NULL,
  online_at TEXT NOT NULL
);

-- School tenants. The current school is the first tenant.
-- Domain cskphc.edu.mo keeps the existing Google login when ALLOWED_EMAIL_DOMAINS
-- is cskphc.edu.mo. Rows without school_id are treated as cskphc.
-- Apply migrate-tenancy.sql on the existing D1 database before deploying the worker.
-- Do not set NOW. Deploy with keep_bindings so JWT_SECRET and EXTRA_ALLOWED_EMAILS stay.
CREATE TABLE IF NOT EXISTS schools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS school_domains (
  domain TEXT PRIMARY KEY,
  school_id TEXT NOT NULL
);

INSERT OR IGNORE INTO schools (id, name, created_at)
VALUES ('cskphc', 'cskphc.edu.mo', '2026-11-01T00:00:00.000Z');

INSERT OR IGNORE INTO school_domains (domain, school_id)
VALUES ('cskphc.edu.mo', 'cskphc');

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

-- Teacher-paced live quizzes. Not the Google Sheet and not the ability radar.
-- Existing databases: wrangler d1 execute noteschallenge-auth --remote --file=migrate-live-quiz.sql
-- Do that before deploying the worker. Do not set NOW. Do not change secrets.
CREATE TABLE IF NOT EXISTS live_quizzes (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  teacher_sub TEXT NOT NULL,
  title TEXT NOT NULL,
  limit_ms INTEGER NOT NULL,
  items TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS live_rooms (
  code TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  teacher_sub TEXT NOT NULL,
  quiz_id TEXT NOT NULL,
  state TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS live_results (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  room_code TEXT NOT NULL,
  quiz_title TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  board TEXT NOT NULL
);

-- Sign-in and screen record. Not the leaderboard.
CREATE TABLE IF NOT EXISTS presence_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  presence_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  display_name TEXT NOT NULL,
  class_label TEXT,
  event TEXT NOT NULL,
  screen TEXT,
  at TEXT NOT NULL
);
