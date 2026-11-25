-- arKive D1 Schema (SQLite)
-- Local:  npx wrangler d1 execute arkive-db --local --file=migrations/0001_schema.sql
-- Remote: npx wrangler d1 execute arkive-db --remote --file=migrations/0001_schema.sql

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) <= 20),
  pill_color TEXT NOT NULL DEFAULT '#3b82f6',
  text_color TEXT NOT NULL DEFAULT '#ffffff',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS spaces (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '📁',
  tag_id TEXT REFERENCES tags(id) ON DELETE SET NULL,
  show_in_menu INTEGER NOT NULL DEFAULT 1,
  share_link TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS space_members (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  member_username TEXT NOT NULL COLLATE NOCASE,
  added_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(space_id, member_username)
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  subtitle TEXT DEFAULT '',
  body TEXT DEFAULT '',
  is_markdown INTEGER NOT NULL DEFAULT 0,
  is_draft INTEGER NOT NULL DEFAULT 0,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  passphrase_hash TEXT,
  encrypted_body TEXT,
  date_tag TEXT,
  space_id TEXT REFERENCES spaces(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS post_tags (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

-- Fallback media tables so image uploads work on Cloudflare D1 free tier even without R2 enabled
CREATE TABLE IF NOT EXISTS media (
  key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS media_chunks (
  key TEXT NOT NULL REFERENCES media(key) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (key, idx)
);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_start INTEGER NOT NULL,
  blocked_until INTEGER NOT NULL DEFAULT 0
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_space_id ON posts(space_id);
CREATE INDEX IF NOT EXISTS idx_posts_date_tag ON posts(date_tag);
CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
CREATE INDEX IF NOT EXISTS idx_spaces_user_id ON spaces(user_id);
CREATE INDEX IF NOT EXISTS idx_spaces_share_link ON spaces(share_link);
CREATE INDEX IF NOT EXISTS idx_space_members_space_id ON space_members(space_id);
CREATE INDEX IF NOT EXISTS idx_space_members_username ON space_members(member_username);
CREATE INDEX IF NOT EXISTS idx_post_tags_post ON post_tags(post_id);
CREATE INDEX IF NOT EXISTS idx_post_tags_tag ON post_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_media_user_id ON media(user_id);
