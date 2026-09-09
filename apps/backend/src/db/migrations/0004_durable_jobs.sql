ALTER TABLE records ADD COLUMN job_generation INTEGER NOT NULL DEFAULT 0;
ALTER TABLE records ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE records ADD COLUMN next_attempt_at TEXT;
CREATE TABLE caption_requests (id INTEGER PRIMARY KEY, requested_at INTEGER NOT NULL);
CREATE INDEX caption_requests_time ON caption_requests(requested_at);
CREATE TABLE caption_quota (id INTEGER PRIMARY KEY CHECK(id=1), blocked_until INTEGER NOT NULL DEFAULT 0, hourly_limit INTEGER NOT NULL);
