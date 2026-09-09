CREATE TABLE settings (
 owner_id TEXT PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE,
 api_key TEXT, model TEXT NOT NULL DEFAULT 'gpt-transcribe'
);
