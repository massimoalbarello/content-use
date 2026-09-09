import type { SQL } from 'bun';
import type { CaptionQuota } from '#lib/media/hosted-captions.ts';
export class SqliteCaptionQuota implements CaptionQuota {
  constructor(
    private readonly db: SQL,
    private readonly limit = 50,
  ) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new Error('CAPTION_HOURLY_LIMIT must be an integer from 1 to 50.');
    }
  }
  reserve(now = Date.now()) {
    return this.db.begin(async (tx) => {
      await tx`INSERT INTO caption_quota(id,hourly_limit) VALUES(1,${this.limit}) ON CONFLICT(id) DO NOTHING`;
      await tx`DELETE FROM caption_requests WHERE requested_at<=${now - 3600000}`;
      const [quota] = await tx`SELECT * FROM caption_quota WHERE id=1`;
      if (Number(quota.blocked_until) > now) {
        return Number(quota.blocked_until);
      }
      const [count] =
        await tx`SELECT count(*) AS n,min(requested_at) AS first FROM caption_requests`;
      if (Number(count.n) >= Math.min(this.limit, Number(quota.hourly_limit))) {
        return Number(count.first) + 3600001;
      }
      await tx`INSERT INTO caption_requests(requested_at) VALUES(${now})`;
      return 0;
    });
  }
  async observe(headers: Headers, status: number, dailyCap: boolean, now = Date.now()) {
    const reset = Number(headers.get('x-ratelimit-reset')) * 1000;
    const retryAt = retryTime(headers.get('retry-after'), now);
    const limited = status === 429 || headers.get('x-ratelimit-remaining') === '0';
    const nextMidnight = new Date(now);
    nextMidnight.setUTCHours(24, 0, 5, 0);
    const until = limited
      ? Math.max(
          now + 1000,
          Number.isFinite(reset) ? reset : 0,
          Number.isFinite(retryAt) ? retryAt : 0,
          dailyCap ? nextMidnight.getTime() : 0,
          !reset && !retryAt && !dailyCap ? now + 3600000 : 0,
        ) + 1000
      : 0;
    const advertised = Number(headers.get('x-ratelimit-limit'));
    const limit =
      Number.isInteger(advertised) && advertised > 0
        ? Math.min(this.limit, advertised)
        : this.limit;
    await this
      .db`INSERT INTO caption_quota(id,hourly_limit,blocked_until) VALUES(1,${limit},${until}) ON CONFLICT(id) DO UPDATE SET hourly_limit=excluded.hourly_limit,blocked_until=max(blocked_until,excluded.blocked_until)`;
    return until;
  }
}

function retryTime(value: string | null, now: number) {
  if (!value) {
    return 0;
  }
  return /^\d+$/.test(value) ? now + Number(value) * 1000 : Date.parse(value);
}
