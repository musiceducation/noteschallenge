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
