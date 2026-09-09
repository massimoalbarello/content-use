CREATE TABLE playlists (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
 youtube_id TEXT NOT NULL, url TEXT NOT NULL, title TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 checked_at TEXT, next_check_at TEXT NOT NULL, error TEXT,
 UNIQUE(owner_id,youtube_id)
);
CREATE TABLE playlist_videos (
 playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
 video_id TEXT NOT NULL, record_id TEXT REFERENCES records(id) ON DELETE SET NULL,
 PRIMARY KEY(playlist_id,video_id)
);
CREATE INDEX playlist_videos_record ON playlist_videos(record_id);
