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
