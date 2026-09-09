import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createSqliteDatabase } from '../../../src/db/client';
import { CaptionServiceError } from '../../../src/lib/media/hosted-captions';
import { SqliteJobsRepository } from '../../../src/repositories/jobs/repository';
import { SqlitePlaylistsRepository } from '../../../src/repositories/playlists/repository';
import { SqliteRecordsRepository } from '../../../src/repositories/records/repository';
import { RecordProcessor } from '../../../src/services/jobs/processor';
import { JobWorker } from '../../../src/services/jobs/worker';

const folder = process.argv[2]!;
const db = await createSqliteDatabase({ dataFolder: folder });
const records = new SqliteRecordsRepository(db);
const log = (event: object) =>
  appendFile(join(folder, 'events.jsonl'), `${JSON.stringify(event)}\n`);
const config = () => Bun.file(join(folder, 'source.json')).json();
const worker = new JobWorker(
  records,
  new SqliteJobsRepository(db),
  new RecordProcessor(records, {
    captions: async ({ record, signal }) => {
      await log({ event: 'caption', id: record.id, time: Date.now() });
      const source = await config();
      if (source.hold) {
        await Bun.sleep(60000);
      }
      signal.throwIfAborted();
      if (source.retryAt) {
        throw new CaptionServiceError('Rate limited', source.retryAt);
      }
      if (source.permanent) {
        throw new CaptionServiceError('No captions', null, true);
      }
      if (source.transient) {
        throw new Error('Temporary outage');
      }
      return { markdown: 'Recovered transcript', title: 'Video', duration: 12 };
    },
    download: () => Promise.reject(new Error('YouTube must use embeds')),
    mediaPath: () => '',
    deleteFiles: () => Promise.resolve(),
  }),
  new SqlitePlaylistsRepository(db),
  {
    list: async () => {
      await log({ event: 'poll', time: Date.now() });
      const source = await config();
      if (source.pollError) {
        throw new Error('Playlist unavailable');
      }
      return { title: 'Playlist', videos: source.videos ?? [] };
    },
  },
);
await worker.start(folder);
process.stdin.on('data', () => worker.wake());
process.on('SIGTERM', () => {
  void worker
    .stop()
    .then(() => db.close())
    .then(() => process.exit(0));
});
await log({ event: 'started' });
