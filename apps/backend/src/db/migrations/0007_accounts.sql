CREATE TABLE accounts (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
 youtube_id TEXT NOT NULL, url TEXT NOT NULL, title TEXT NOT NULL,
 UNIQUE(owner_id,youtube_id)
);
ALTER TABLE playlists ADD COLUMN account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL;
CREATE INDEX playlists_account ON playlists(account_id);
