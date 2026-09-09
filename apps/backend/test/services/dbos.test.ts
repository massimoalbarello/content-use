import { expect, test } from 'bun:test';
import { DBOS } from '@dbos-inc/dbos-sdk';
import { SQL } from 'bun';
import { CaptionServiceError } from '../../src/lib/media/hosted-captions';
import { SqliteJobsRepository } from '../../src/repositories/jobs/repository';
import { SqlitePlaylistsRepository } from '../../src/repositories/playlists/repository';
import { SqliteRecordsRepository } from '../../src/repositories/records/repository';
import { RecordProcessor } from '../../src/services/jobs/processor';
import { JobWorker } from '../../src/services/jobs/worker';
import { testDatabase } from '../support/database';

const databaseUrl = process.env.TEST_DBOS_DATABASE_URL;
const integration = databaseUrl ? test : test.skip;
integration(
  'DBOS retries rate-limited records, checkpoints completed work and discovers new playlist videos',
  async () => {
    const url = new URL(databaseUrl!);
    const databaseName = `content_use_test_${crypto.randomUUID().replaceAll('-', '')}`;
    url.pathname = `/${databaseName}`;
    const db = await testDatabase();
    const records = new SqliteRecordsRepository(db);
    const playlists = new SqlitePlaylistsRepository(db);
    let calls = 0;
    let listings = 0;
    const videos = [{ id: 'rY0wnfFHYbs', title: 'One' }];
    const makeWorker = () =>
      new JobWorker(
        records,
        new SqliteJobsRepository(db),
        new RecordProcessor(records, {
          captions: () => {
            calls++;
            if (calls === 1) {
              return Promise.reject(new CaptionServiceError('Rate limited', Date.now() + 1500));
            }
            return Promise.resolve({
              markdown: 'Recovered transcript',
              title: 'Video',
              duration: 12,
            });
          },
          download: () => Promise.reject(new Error('YouTube must use embeds')),
          mediaPath: () => '',
          deleteFiles: () => Promise.resolve(),
        }),
        playlists,
        {
          list: () => {
            listings++;
            return Promise.resolve({ title: 'Playlist', videos });
          },
        },
      );
    let worker = makeWorker();
    try {
      const id = await playlists.create({
        ownerId: 'alice',
        youtubeId: 'PLabcdefghijk',
        url: 'https://www.youtube.com/playlist?list=PLabcdefghijk',
        title: 'Playlist',
      });
      await worker.start(url.href);
      await until(async () => {
        const result = await records.list({ ownerId: 'alice', search: '', offset: 0 });
        return result.records[0]?.progress.startsWith('Retry scheduled') ?? false;
      });
      expect(calls).toBe(1);
      await worker.stop();
      await DBOS.shutdown({ deregister: true });
      worker = makeWorker();
      await worker.start(url.href);
      await until(
        async () =>
          (await records.list({ ownerId: 'alice', search: '', offset: 0 })).records[0]?.status ===
          'ready',
      );
      expect(calls).toBe(2);
      expect(listings).toBe(1);
      expect((await playlists.list({ ownerId: 'alice' }))[0]?.polls[0]).toMatchObject({
        status: 'succeeded',
        addedCount: 1,
        scannedCount: 1,
      });
      videos.push({ id: 'aircAruvnKk', title: 'Two' });
      await db`UPDATE playlists SET next_check_at=${new Date().toISOString()} WHERE id=${id}`;
      const sync = await DBOS.triggerSchedule('library-dispatch');
      await sync.getResult();
      await until(async () => {
        const result = await records.list({ ownerId: 'alice', search: '', offset: 0 });
        return result.total === 2 && result.records.every((r) => r.status === 'ready');
      });
      expect(calls).toBe(3);
      expect((await playlists.list({ ownerId: 'alice' }))[0]?.readyCount).toBe(2);
      expect((await playlists.list({ ownerId: 'alice' }))[0]?.polls[0]).toMatchObject({
        status: 'succeeded',
        addedCount: 1,
        scannedCount: 2,
      });
    } finally {
      await worker.stop();
      await DBOS.shutdown({ deregister: true });
      await db.close();
      url.pathname = '/postgres';
      const admin = new SQL(url.href);
      try {
        await admin.unsafe(`DROP DATABASE ${databaseName}`);
      } finally {
        await admin.close();
      }
    }
  },
  30000,
);
async function until(check: () => Promise<boolean>) {
  for (let i = 0; i < 180; i++) {
    if (await check()) {
      return;
    }
    await Bun.sleep(100);
  }
  throw new Error('Durable workflow did not reach expected state.');
}
