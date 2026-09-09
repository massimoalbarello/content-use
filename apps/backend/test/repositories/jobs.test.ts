import { expect, test } from 'bun:test';
import { SqliteJobsRepository } from '../../src/repositories/jobs/repository';
import { SqliteRecordsRepository } from '../../src/repositories/records/repository';
import { testDatabase } from '../support/database';

test('pending reconciliation preserves deadlines and rejects stale generations and other owners', async () => {
  const db = await testDatabase();
  const jobs = new SqliteJobsRepository(db);
  const records = new SqliteRecordsRepository(db);
  try {
    const record = await records.create({
      ownerId: 'alice',
      id: 'job',
      title: 'Video',
      url: 'https://youtu.be/rY0wnfFHYbs',
    });
    const original = (await jobs.pending())[0]!;
    // Existing dispatch markers must not strand work when switching queue engines.
    await db`UPDATE records SET enqueued_generation=job_generation WHERE id=${record.id}`;
    expect(await jobs.pending()).toHaveLength(1);
    const retryAt = Date.now() + 3600000;
    await jobs.waiting({ ...original, retryAt, attempts: 2, error: 'Try later' });
    expect(await jobs.current(original)).toEqual({
      attempts: 2,
      nextAttemptAt: new Date(retryAt).toISOString(),
    });
    expect(await jobs.current({ ...original, ownerId: 'bob' })).toBeNull();
    await records.progress({ ...record, status: 'failed', progress: 'Failed' });
    expect(await jobs.pending()).toHaveLength(0);
    await records.retry(record);
    await jobs.waiting({ ...original, retryAt, attempts: 8, error: 'Stale' });
    const retry = (await jobs.pending())[0]!;
    expect(retry.generation).toBe(1);
    expect(await jobs.current(original)).toBeNull();
    expect(await jobs.current(retry)).toMatchObject({ attempts: 0 });
    await records.remove(record);
    expect(await jobs.pending()).toHaveLength(0);
  } finally {
    await db.close();
  }
});
