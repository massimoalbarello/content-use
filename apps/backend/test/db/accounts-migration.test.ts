import { expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrate } from '../../src/db/migrate';

test('account migration preserves deployed identity, settings, captions, polling, and job checkpoints', async () => {
  const db = new SQL({ adapter: 'sqlite', filename: ':memory:' });
  try {
    await db.unsafe('PRAGMA foreign_keys=ON');
    await db.unsafe('CREATE TABLE migrations(version INTEGER PRIMARY KEY)');
    const folder = join(import.meta.dir, '../../src/db/migrations');
    const previous = (await readdir(folder))
      .filter((file) => /^000[0-6]_.*\.sql$/.test(file))
      .sort();
    expect(previous).toHaveLength(7);
    for (const [version, file] of previous.entries()) {
      const sql = await Bun.file(join(folder, file)).text();
      for (const statement of sql.split(';').filter((value) => value.trim())) {
        await db.unsafe(statement);
      }
      await db`INSERT INTO migrations(version) VALUES(${version})`;
    }
    await db`INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES('alice','Alice','alice@example.com',1,'2026-01-01','2026-01-01')`;
    await db`INSERT INTO auth_passkey(id,publicKey,userId,credentialID,counter,deviceType,backedUp) VALUES('passkey','public-key','alice','credential',4,'singleDevice',0)`;
    await db`INSERT INTO settings(owner_id,api_key,model) VALUES('alice','test-key','gpt-transcribe')`;
    await db`INSERT INTO records(id,owner_id,title,url,status,markdown,progress,created_at,updated_at,job_generation,attempts,next_attempt_at) VALUES('record','alice','Edited title','https://youtu.be/rY0wnfFHYbs','transcribing','Saved captions','Checkpoint','2026-01-01','2026-01-01',3,2,'2026-09-10')`;
    await db`INSERT INTO playlists(id,owner_id,youtube_id,url,title,next_check_at) VALUES('playlist','alice','PLabcdefghijk','https://www.youtube.com/playlist?list=PLabcdefghijk','Playlist','2026-09-10')`;
    await db`INSERT INTO playlist_videos(playlist_id,video_id,record_id) VALUES('playlist','rY0wnfFHYbs','record')`;
    await db`INSERT INTO playlist_polls(id,playlist_id,started_at,status) VALUES('poll','playlist','2026-09-09','checking')`;
    const tables = [
      'auth_user',
      'auth_passkey',
      'settings',
      'records',
      'playlist_videos',
      'playlist_polls',
    ];
    const snapshots = await Promise.all(tables.map((table) => db.unsafe(`SELECT * FROM ${table}`)));
    await migrate(db);
    await migrate(db);
    for (const [index, table] of tables.entries()) {
      expect(await db.unsafe(`SELECT * FROM ${table}`)).toEqual(snapshots[index]);
    }
    const retained: { account_id: string | null; next_check_at: string; enabled: number }[] =
      await db`SELECT account_id,next_check_at,enabled FROM playlists`;
    expect(retained).toEqual([{ account_id: null, next_check_at: '2026-09-10', enabled: 1 }]);
    expect(await db`SELECT * FROM accounts`).toHaveLength(0);
    expect(await db`SELECT * FROM utilint_secrets`).toHaveLength(0);
    expect(await db`SELECT * FROM record_summaries`).toHaveLength(0);
    expect(await db`SELECT version FROM migrations`).toHaveLength(9);
    expect(await db.unsafe('PRAGMA foreign_key_check')).toHaveLength(0);
  } finally {
    await db.close();
  }
});
