CREATE TABLE playlist_polls (
 id TEXT PRIMARY KEY,
 playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
 started_at TEXT NOT NULL, finished_at TEXT,
 status TEXT NOT NULL CHECK(status IN ('checking','succeeded','failed','cancelled')),
 attempts INTEGER NOT NULL DEFAULT 1,
 scanned_count INTEGER, added_count INTEGER, linked_count INTEGER, error TEXT
);
CREATE INDEX playlist_polls_recent ON playlist_polls(playlist_id,started_at DESC);
