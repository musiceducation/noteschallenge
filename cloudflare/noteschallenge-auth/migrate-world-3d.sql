-- Cross-isolate persistent 3D Music Party World rooms for noteschallenge-auth.
-- Apply once on the existing D1 database before deploying a worker that serves /world/* :
--   npx wrangler d1 execute noteschallenge-auth --remote --file=migrate-world-3d.sql
-- Then deploy only when the owner explicitly approves (with keep_bindings):
--   npx wrangler deploy
-- Keep the existing d1, secret_text, and plain_text bindings.
-- Do not change ALLOWED_EMAIL_DOMAINS, JWT_SECRET, or EXTRA_ALLOWED_EMAILS.
-- Do not set NOW. Do not set compatibility_date to "now" or Date.now().
-- These rooms are completely separate from /live/* quizzes, Google Sheet, and ability radar.

CREATE TABLE IF NOT EXISTS world_rooms (
  code TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  host_id TEXT NOT NULL,
  state TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
