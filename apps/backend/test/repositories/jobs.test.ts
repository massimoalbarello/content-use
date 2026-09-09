import { expect, test } from 'bun:test';
import { SqliteJobsRepository } from '../../src/repositories/jobs/repository';
import { SqliteRecordsRepository } from '../../src/repositories/records/repository';
import { testDatabase } from '../support/database';

test('dispatch acknowledgement does not lose a newer retry or repeatedly enqueue a backlog', async () => {
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
    await jobs.acknowledge(original);
    expect(await jobs.pending()).toHaveLength(0);
    await records.progress({ ...record, status: 'failed', progress: 'Failed' });
    await records.retry(record);
    await jobs.acknowledge(original);
    const retry = (await jobs.pending())[0]!;
    expect(retry.generation).toBe(1);
    expect(await jobs.current(original)).toBeNull();
    await records.remove(record);
    await jobs.acknowledge(retry);
    expect(await jobs.pending()).toHaveLength(0);
  } finally {
    await db.close();
  }
});
