import { expect, test } from 'bun:test';
import { SqliteCaptionQuota } from '../../src/repositories/jobs/quota';
import { testDatabase } from '../support/database';

test('caption quota enforces a shared sliding hour across instances and persists provider cooldown', async () => {
  const db = await testDatabase();
  const quota = new SqliteCaptionQuota(db);
  const now = Date.UTC(2026, 8, 9, 12);
  try {
    for (let i = 0; i < 50; i++) {
      expect(await quota.reserve(now + i)).toBe(0);
    }
    const restarted = new SqliteCaptionQuota(db);
    expect(await restarted.reserve(now + 100)).toBe(now + 3600001);
    expect(await restarted.reserve(now + 3600001)).toBe(0);
    const until = await quota.observe(
      new Headers({ 'Retry-After': '7200', 'X-RateLimit-Limit': '20' }),
      429,
      false,
      now + 3600001,
    );
    expect(await restarted.reserve(now + 3600002)).toBe(until);
    const daily = await quota.observe(new Headers(), 429, true, now);
    expect(daily).toBeGreaterThanOrEqual(Date.UTC(2026, 8, 10));
  } finally {
    await db.close();
  }
});
