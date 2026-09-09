import type { SQL } from 'bun';
import type { Actor } from '#models/records.ts';
export type RecordJob = Actor & { id: string; generation: number; url: string };
export interface JobsRepository {
  pending(after?: string): Promise<RecordJob[]>;
  acknowledge(input: RecordJob): Promise<void>;
  current(input: RecordJob): Promise<{ attempts: number } | null>;
  waiting(input: RecordJob & { retryAt: number; attempts: number; error: string }): Promise<void>;
}
export class SqliteJobsRepository implements JobsRepository {
  constructor(private readonly db: SQL) {}
  pending(after = ''): Promise<RecordJob[]> {
    return this
      .db`SELECT id,owner_id AS ownerId,job_generation AS generation,url FROM records WHERE status IN ('queued','downloading','transcribing') AND (enqueued_generation IS NULL OR enqueued_generation<>job_generation) AND id>${after} ORDER BY id LIMIT 100`;
  }
  async acknowledge(input: RecordJob) {
    await this
      .db`UPDATE records SET enqueued_generation=${input.generation} WHERE id=${input.id} AND owner_id=${input.ownerId} AND job_generation=${input.generation}`;
  }
  async current(input: RecordJob) {
    const [row] = await this
      .db`SELECT attempts,status FROM records WHERE id=${input.id} AND owner_id=${input.ownerId} AND job_generation=${input.generation}`;
    return row && !['ready', 'failed'].includes(row.status)
      ? { attempts: Number(row.attempts) }
      : null;
  }
  async waiting(input: RecordJob & { retryAt: number; attempts: number; error: string }) {
    const when = new Date(input.retryAt).toISOString();
    await this
      .db`UPDATE records SET status='queued',attempts=${input.attempts},next_attempt_at=${when},progress=${`Retry scheduled for ${when}`},error=${input.error},updated_at=${new Date().toISOString()} WHERE id=${input.id} AND owner_id=${input.ownerId} AND job_generation=${input.generation}`;
  }
}
