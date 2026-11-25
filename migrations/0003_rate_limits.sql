-- Adds lightweight D1 rate limiting table for login/register protection
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_start INTEGER NOT NULL,
  blocked_until INTEGER NOT NULL DEFAULT 0
);
