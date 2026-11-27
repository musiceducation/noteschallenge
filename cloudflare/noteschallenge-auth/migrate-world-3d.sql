-- Cross-isolate persistent 3D Music Party World rooms for noteschallenge-auth.
-- Uses per-room version CAS (world_rooms) + per-player rows with version CAS (world_players)
-- so concurrent /world/sync requests never overwrite each other's positions, scores, or claims.
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
  version INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS world_players (
  room_code TEXT NOT NULL,
  player_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (room_code, player_id)
);

CREATE INDEX IF NOT EXISTS idx_world_players_room ON world_players (room_code);
