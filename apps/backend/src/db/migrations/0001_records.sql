CREATE TABLE records (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
 title TEXT NOT NULL, url TEXT NOT NULL, markdown TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL CHECK(status IN ('queued','downloading','transcribing','ready','failed')),
 progress TEXT NOT NULL DEFAULT 'Waiting to start', error TEXT, media_name TEXT,
 media_type TEXT CHECK(media_type IN ('audio','video')), duration REAL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX records_owner_created ON records(owner_id, created_at DESC);
CREATE INDEX records_owner_url ON records(owner_id,url);
CREATE INDEX records_status ON records(status, created_at);
CREATE TABLE transcript_chunks (
 record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
 chunk_index INTEGER NOT NULL, text TEXT NOT NULL, PRIMARY KEY(record_id, chunk_index)
);
