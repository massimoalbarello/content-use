CREATE TABLE utilint_secrets (
  owner_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('client','tokens')),
  encrypted TEXT NOT NULL,
  PRIMARY KEY(owner_id,kind)
);
CREATE TABLE record_summaries (
  record_id TEXT PRIMARY KEY REFERENCES records(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  source_hash TEXT NOT NULL,
  summary TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL
);
