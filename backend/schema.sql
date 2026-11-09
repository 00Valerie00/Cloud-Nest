-- Cloud Nest logical schema (SQLite). The MVP client stores records locally;
-- this schema is the server-side persistence contract for a hosted deployment.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  openid TEXT UNIQUE,
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  guest_key_hash TEXT,
  display_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_expiry ON auth_sessions(user_id, expires_at);

CREATE TABLE IF NOT EXISTS auth_verification_codes (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('phone', 'email')),
  destination TEXT NOT NULL,
  destination_hash TEXT NOT NULL,
  request_ip_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS auth_codes_target_time ON auth_verification_codes(destination_hash, created_at);
CREATE INDEX IF NOT EXISTS auth_codes_ip_time ON auth_verification_codes(request_ip_hash, created_at);

CREATE TABLE IF NOT EXISTS pet_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  nickname TEXT,
  species TEXT NOT NULL,
  sex TEXT,
  birthday TEXT,
  passing_date TEXT,
  traits_json TEXT NOT NULL DEFAULT '[]',
  habits TEXT,
  story TEXT,
  photo_refs_json TEXT NOT NULL DEFAULT '[]',
  archived INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL REFERENCES pet_profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS chat_messages_pet_time ON chat_messages(pet_id, created_at);

CREATE TABLE IF NOT EXISTS daily_letters (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL REFERENCES pet_profiles(id) ON DELETE CASCADE,
  letter_date TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (pet_id, letter_date)
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  daily_letters INTEGER NOT NULL DEFAULT 1,
  star_map INTEGER NOT NULL DEFAULT 1,
  community INTEGER NOT NULL DEFAULT 1,
  quiet_mode INTEGER NOT NULL DEFAULT 0,
  push_enabled INTEGER NOT NULL DEFAULT 1,
  widget_style TEXT NOT NULL DEFAULT 'A',
  star_city TEXT,
  star_phrase TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- User-selected area sharing is opt-in. city_code is retained as the storage
-- column for compatibility; values now include province, country, and ocean codes.
-- Public responses expose only anonymous location aggregates, never account IDs.
CREATE TABLE IF NOT EXISTS nebula_locations (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  city_code TEXT NOT NULL,
  consented_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS nebula_locations_city ON nebula_locations(city_code);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'accepted',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, template_id)
);

CREATE TABLE IF NOT EXISTS daily_deliveries (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL REFERENCES pet_profiles(id) ON DELETE CASCADE,
  letter_id TEXT NOT NULL REFERENCES daily_letters(id) ON DELETE CASCADE,
  delivered_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  UNIQUE (pet_id, letter_id)
);

CREATE TABLE IF NOT EXISTS circle_memberships (
  pet_id TEXT PRIMARY KEY REFERENCES pet_profiles(id) ON DELETE CASCADE,
  circle_key TEXT,
  joined_at TEXT
);

CREATE TABLE IF NOT EXISTS circle_posts (
  id TEXT PRIMARY KEY,
  circle_key TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS circle_posts_time ON circle_posts(circle_key, created_at);

CREATE TABLE IF NOT EXISTS star_memories (
  id TEXT PRIMARY KEY,
  city TEXT,
  phrase TEXT NOT NULL CHECK (length(phrase) <= 60),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS star_memories_time ON star_memories(created_at);

-- Small per-pet factual memory store. Embeddings are sparse character n-gram vectors
-- computed locally; no separate embedding API or image is stored here.
CREATE TABLE IF NOT EXISTS pet_memories (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  pet_id TEXT NOT NULL,
  content TEXT NOT NULL CHECK (length(content) <= 240),
  source TEXT NOT NULL CHECK (source IN ('auto_extract', 'profile_prompt', 'image_confirmed')),
  vector_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (pet_id, content)
);
CREATE INDEX IF NOT EXISTS pet_memories_pet_time ON pet_memories(pet_id, created_at);
-- The owner index is created after init_database adds user_id to existing MVP databases.

-- No public nickname, avatar, GPS coordinates, direct-message, like, or reply tables.
-- The optional nebula table stores only a user-selected location code after consent.
