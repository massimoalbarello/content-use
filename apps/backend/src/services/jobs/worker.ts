import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type Job,
  type Processor,
  Queue,
  shutdownManager,
  Worker,
  type WorkerOptions,
} from 'bunqueue/client';
import { CaptionServiceError } from '#lib/media/hosted-captions.ts';
import type { YoutubePlaylists } from '#lib/media/playlists.ts';
import { type Actor, youtubeEmbed } from '#models/records.ts';
import type { JobsRepository, RecordJob } from '#repositories/jobs/repository.ts';
import type { PlaylistsRepository } from '#repositories/playlists/repository.ts';
import type { RecordsRepository } from '#repositories/records/repository.ts';
import type { RecordProcessor } from './processor';

type PlaylistJob = Actor & { id: string; url: string; nextCheckAt: string };
const options = {
  durable: true,
  removeOnComplete: true,
  removeOnFail: true,
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000 },
};

export class JobWorker {
  private stopped = true;
  private waking: Promise<void> | undefined;
  private transcripts!: Queue<RecordJob>;
  private media!: Queue<RecordJob>;
  private discovery!: Queue<PlaylistJob>;
  private dispatch!: Queue<null>;
  private workers: Pick<Worker, 'pause' | 'close'>[] = [];
  private readonly polling = new Set<AbortController>();

  constructor(
    private readonly records: RecordsRepository,
    private readonly jobs: JobsRepository,
    private readonly processor: RecordProcessor,
    private readonly playlists: PlaylistsRepository,
    private readonly source: Pick<YoutubePlaylists, 'list'>,
  ) {}

  async start(dataFolder: string) {
    await mkdir(dataFolder, { recursive: true });
    const connection = { embedded: true, dataPath: join(dataFolder, 'jobs.sqlite') };
    const queueOptions = { ...connection, defaultJobOptions: options };
    this.transcripts = new Queue('transcripts', queueOptions);
    this.media = new Queue('media', queueOptions);
    this.discovery = new Queue('playlists', {
      ...queueOptions,
      defaultJobOptions: { ...options, backoff: { type: 'exponential', delay: 30000 } },
    });
    this.dispatch = new Queue('dispatch', queueOptions);
    this.stopped = false;
    this.workers = [
      createWorker<RecordJob>('transcripts', (job) => this.processRecord(job), {
        ...connection,
        concurrency: 4,
      }),
      createWorker<RecordJob>('media', (job) => this.processRecord(job), connection),
      createWorker<PlaylistJob>('playlists', (job) => this.pollPlaylist(job), connection),
      createWorker<null>('dispatch', () => this.reconcile(), connection),
    ];
    // Playlist deadlines remain hourly. A minute tick also recovers record writes
    // committed before queue submission, including work from older deployments.
    await this.dispatch.upsertJobScheduler(
      'library-dispatch',
      { every: 60000, preventOverlap: true },
      { name: 'reconcile', data: null, opts: options },
    );
    this.wake();
  }

  private async reconcile() {
    for (const playlist of await this.playlists.due()) {
      if (this.stopped) {
        return;
      }
      await this.discovery.add('discover', playlist, {
        jobId: `playlist:${playlist.id}:${playlist.nextCheckAt}`,
      });
    }
    let after = '';
    while (!this.stopped) {
      const batch = await this.jobs.pending(after);
      for (const job of batch) {
        if (this.stopped) {
          return;
        }
        const queue = youtubeEmbed(job.url) ? this.transcripts : this.media;
        await queue.add('process', job, { jobId: `record:${job.id}:${job.generation}` });
      }
      if (batch.length < 100) {
        return;
      }
      after = batch.at(-1)!.id;
    }
  }

  wake() {
    if (this.stopped || this.waking) {
      return;
    }
    this.waking = this.dispatch
      .add('reconcile', null)
      .then(() => {})
      .catch((error) => console.error('Could not dispatch jobs:', message(error)))
      .finally(() => {
        this.waking = undefined;
      });
  }

  private async pollPlaylist(job: Job<PlaylistJob>) {
    const input = { ...job.data, pollId: `playlist:${job.data.id}:${job.data.nextCheckAt}` };
    const controller = new AbortController();
    this.polling.add(controller);
    try {
      if (this.stopped) {
        await job.moveToDelayed(Date.now() + 1000, job.token);
        return;
      }
      if (!(await this.playlists.beginPoll(input))) {
        return;
      }
      const result = await this.source.list(
        input.url,
        AbortSignal.any([controller.signal, AbortSignal.timeout(5 * 60000)]),
      );
      controller.signal.throwIfAborted();
      await this.playlists.sync({ ...input, ...result });
      this.wake();
    } catch (error) {
      if (this.stopped) {
        await job.moveToDelayed(Date.now() + 1000, job.token);
      } else if (job.attemptsMade + 1 >= options.attempts) {
        await this.playlists.failure({ ...input, error: message(error) });
      } else {
        throw error;
      }
    } finally {
      this.polling.delete(controller);
    }
  }

  private async processRecord(job: Job<RecordJob>) {
    if (this.stopped) {
      await job.moveToDelayed(Date.now() + 1000, job.token);
      return;
    }
    const current = await this.jobs.current(job.data);
    if (!current) {
      return;
    }
    const deadline = current.nextAttemptAt ? Date.parse(current.nextAttemptAt) : 0;
    if (deadline > Date.now()) {
      await job.moveToDelayed(deadline, job.token);
      return;
    }
    const record = await this.records.get(job.data);
    if (!record) {
      return;
    }
    try {
      await this.processor.run(record);
    } catch (error) {
      if (this.stopped) {
        await job.moveToDelayed(Date.now() + 1000, job.token);
        return;
      }
      if (!(await this.jobs.current(job.data))) {
        return;
      }
      const retryAt = await this.retry(job.data, current.attempts, error);
      if (retryAt !== null) {
        await job.moveToDelayed(retryAt, job.token);
      }
    }
  }

  private async retry(job: RecordJob, previousAttempts: number, error: unknown) {
    const rateLimited = error instanceof CaptionServiceError && error.retryAt !== null;
    const attempts = previousAttempts + (rateLimited ? 0 : 1);
    if ((error instanceof CaptionServiceError && error.permanent) || attempts >= 8) {
      await this.records.progress({
        ...job,
        status: 'failed',
        progress: 'Needs attention',
        error: message(error),
      });
      return null;
    }
    const delay = rateLimited
      ? Math.max(1000, error.retryAt! - Date.now())
      : Math.min(3600000, 30000 * 2 ** (attempts - 1));
    const retryAt = Date.now() + delay;
    await this.jobs.waiting({ ...job, attempts, retryAt, error: message(error) });
    return retryAt;
  }

  async cancel(id: string) {
    // Deleted records fail the owner/generation check if a delayed job wakes later.
    await this.processor.cancel(id);
  }
  deleteFiles(input: Actor & { id: string }) {
    return this.processor.deleteFiles(input);
  }
  mediaPath(input: Actor & { id: string; name: string }) {
    return this.processor.mediaPath(input);
  }
  async stop() {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    for (const worker of this.workers) {
      worker.pause();
    }
    for (const controller of this.polling) {
      controller.abort();
    }
    await this.waking;
    await this.processor.stop();
    await Promise.all(this.workers.map((worker) => worker.close()));
    for (const queue of [this.transcripts, this.media, this.discovery, this.dispatch]) {
      queue.close();
    }
    shutdownManager();
  }
}
function createWorker<T>(name: string, processor: Processor<T>, options: WorkerOptions) {
  const worker = new Worker(name, processor, options);
  worker.on('error', (error) => console.error('Job queue error:', message(error)));
  worker.on('failed', (job, error) => console.error('Job failed:', job?.id, message(error)));
  return worker;
}
function message(error: unknown) {
  return (error instanceof Error ? error.message : 'Processing failed. Please retry.').slice(
    0,
    1500,
  );
}
