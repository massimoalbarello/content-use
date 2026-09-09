import type { SQL } from 'bun';
import auth from './migrations/0000_better_auth_schema.sql' with { type: 'text' };
import records from './migrations/0001_records.sql' with { type: 'text' };
import settings from './migrations/0002_settings.sql' with { type: 'text' };

import playlists from './migrations/0003_playlists.sql' with { type: 'text' };
import jobs from './migrations/0004_durable_jobs.sql' with { type: 'text' };

import dispatch from './migrations/0005_job_dispatch.sql' with { type: 'text' };

import polls from './migrations/0006_playlist_polls.sql' with { type: 'text' };
import accounts from './migrations/0007_accounts.sql' with { type: 'text' };
import utilint from './migrations/0008_utilint.sql' with { type: 'text' };

const migrations = [auth, records, settings, playlists, jobs, dispatch, polls, accounts, utilint];
export async function migrate(db: SQL) {
  await db.unsafe('PRAGMA journal_mode = WAL');
  await db.unsafe('CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY)');
  const applied = new Set(
    (await db.unsafe('SELECT version FROM migrations')).map(
      (row: { version: number }) => row.version,
    ),
  );
  for (const [version, sql] of migrations.entries()) {
    if (applied.has(version)) {
      continue;
    }
    await db.begin(async (tx) => {
      for (const statement of sql.split(';').filter((s) => s.trim())) {
        await tx.unsafe(statement);
      }
      await tx`INSERT INTO migrations (version) VALUES (${version})`;
    });
  }
}
