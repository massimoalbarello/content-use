import { expect, test } from 'bun:test';
import { SqliteRecordsRepository } from '../../src/repositories/records/repository';
import { RecordProcessor } from '../../src/services/jobs/processor';
import { testDatabase } from '../support/database';

const media = { name: 'media.mp3', title: 'Talk', type: 'audio' as const, duration: 90 };
const pipeline = {
  download: () => Promise.resolve(media),
  captions: () => Promise.resolve({ markdown: 'Actual captions.', title: 'Talk', duration: 90 }),
  mediaPath: () => '',
  deleteFiles: () => Promise.resolve(),
};
async function until(check: () => Promise<boolean>) {
  for (let i = 0; i < 100; i++) {
    if (await check()) {
      return;
    }
    await Bun.sleep(10);
  }
  throw new Error('Worker did not reach expected state.');
}
test('YouTube records finish with captions without downloading the video', async () => {
  const db = await testDatabase();
  const repo = new SqliteRecordsRepository(db);
  let downloads = 0;
  const worker = new RecordProcessor(repo, {
    ...pipeline,
    download: () => {
      downloads++;
      return Promise.reject(new Error('Must not download YouTube'));
    },
  });
  try {
    const record = await repo.create({
      ownerId: 'alice',
      id: 'captions',
      title: 'https://youtu.be/rY0wnfFHYbs',
      url: 'https://youtu.be/rY0wnfFHYbs',
    });
    void worker.run(record).catch(() => {});
    await until(async () => (await repo.get(record))?.status === 'ready');
    const result = await repo.get(record);
    expect(result?.markdown).toBe('Actual captions.');
    expect(result?.title).toBe('Talk');
    expect(result?.error).toBeNull();
    expect(downloads).toBe(0);
  } finally {
    await worker.stop();
    await db.close();
  }
});
test('a source without captions still downloads successfully without an AI key', async () => {
  const db = await testDatabase();
  const repo = new SqliteRecordsRepository(db);
  const worker = new RecordProcessor(repo, {
    ...pipeline,
    captions: async () => ({ markdown: '', title: 'Talk', duration: 90 }),
  });
  try {
    const record = await repo.create({
      ownerId: 'alice',
      id: 'no-captions',
      title: 'Custom',
      url: 'https://example.com/talk',
    });
    void worker.run(record).catch(() => {});
    await until(async () => (await repo.get(record))?.status === 'ready');
    const result = await repo.get(record);
    expect(result?.mediaName).toBe(media.name);
    expect(result?.markdown).toBe('');
    expect(result?.error).toBeNull();
    expect(result?.title).toBe('Custom');
    expect(result?.progress).toBe('No captions available');
  } finally {
    await worker.stop();
    await db.close();
  }
});
test('deleting an active job aborts processing and does not recreate its record', async () => {
  const db = await testDatabase();
  const repo = new SqliteRecordsRepository(db);
  let started!: () => void;
  const start = new Promise<void>((resolve) => {
    started = resolve;
  });
  const worker = new RecordProcessor(repo, {
    ...pipeline,
    captions: ({ signal }: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        started();
        signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
      }),
  });
  try {
    const record = await repo.create({
      ownerId: 'alice',
      id: 'cancel',
      title: 'Talk',
      url: 'https://example.com/talk',
    });
    void worker.run(record).catch(() => {});
    await start;
    await repo.remove(record);
    await worker.cancel(record.id);
    expect(await repo.get(record)).toBeNull();
  } finally {
    await worker.stop();
    await db.close();
  }
});
