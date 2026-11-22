-- Live classroom quizzes for noteschallenge-auth.
-- Apply on the existing D1 database before deploying a worker that serves /live/* :
--   npx wrangler d1 execute noteschallenge-auth --remote --file=migrate-live-quiz.sql
-- Then deploy only when the owner says so:
--   npx wrangler deploy
-- Keep the existing d1, secret_text, and plain_text bindings.
-- Do not change ALLOWED_EMAIL_DOMAINS, JWT_SECRET, or EXTRA_ALLOWED_EMAILS.
-- Do not set NOW. Do not set compatibility_date to "now" or Date.now().
-- These tables are the in-room record. They are not the Google Sheet and not the ability radar.

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
