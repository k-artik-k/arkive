-- Adds chunked media support for large D1 imports/images
CREATE TABLE IF NOT EXISTS media_chunks (
  key TEXT NOT NULL REFERENCES media(key) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (key, idx)
);
