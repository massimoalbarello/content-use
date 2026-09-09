import { DBOS } from '@dbos-inc/dbos-sdk';
import { CaptionServiceError } from '#lib/media/hosted-captions.ts';
import type { YoutubePlaylists } from '#lib/media/playlists.ts';
import { type Actor, youtubeEmbed } from '#models/records.ts';
import type { JobsRepository, RecordJob } from '#repositories/jobs/repository.ts';
import type { PlaylistsRepository } from '#repositories/playlists/repository.ts';
import type { RecordsRepository } from '#repositories/records/repository.ts';
import type { RecordProcessor } from './processor';
export class JobWorker {
  private stopped = false;
  private waking: Promise<void> | undefined;
  private readonly recordWorkflow;
  private readonly playlistWorkflow;
  private readonly dispatchWorkflow;
  constructor(
    private readonly records: RecordsRepository,
    private readonly jobs: JobsRepository,
    private readonly processor: RecordProcessor,
    private readonly playlists: PlaylistsRepository,
    private readonly source: Pick<YoutubePlaylists, 'list'>,
  ) {
    this.recordWorkflow = DBOS.registerWorkflow(
      async (job: RecordJob) => {
        while (true) {
          let delay: number | null;
          try {
            delay = await DBOS.runStep(() => this.attempt(job), {
              name: 'process-record',
              retriesAllowed: true,
              maxAttempts: 3,
              intervalSeconds: 5,
            });
          } catch (error) {
            if (this.stopped) {
              throw error;
            }
            await DBOS.runStep(
              () =>
                this.records.progress({
                  ...job,
                  status: 'failed',
                  progress: 'Needs attention',
                  error: message(error),
                }),
              { name: 'record-workflow-failure' },
            );
            return;
          }
          if (delay === null) {
            return;
          }
          await DBOS.sleep(delay);
        }
      },
      { name: 'record-transcript-v1' },
    );
    this.playlistWorkflow = DBOS.registerWorkflow(
      async (input: Actor & { id: string; url: string }) => {
        try {
          await DBOS.runStep(
            async () => {
              const pollId = DBOS.workflowID!;
              if (!(await this.playlists.beginPoll({ ...input, pollId }))) {
                return;
              }
              const result = await this.source.list(input.url, AbortSignal.timeout(5 * 60000));
              await this.playlists.sync({ ...input, ...result, pollId });
            },
            {
              name: 'discover-playlist',
              retriesAllowed: true,
              maxAttempts: 3,
              intervalSeconds: 30,
              backoffRate: 2,
            },
          );
        } catch (error) {
          await DBOS.runStep(
            () =>
              this.playlists.failure({ ...input, error: message(error), pollId: DBOS.workflowID! }),
            {
              name: 'record-playlist-error',
            },
          );
        }
        await this.dispatchRecords();
      },
      { name: 'playlist-discovery-v1' },
    );
    this.dispatchWorkflow = DBOS.registerWorkflow(
      async (_time: Date, _context: unknown) => {
        const due = await DBOS.runStep(() => this.playlists.due(), { name: 'due-playlists' });
        for (const playlist of due) {
          await DBOS.startWorkflow(this.playlistWorkflow, {
            queueName: 'playlists',
            workflowID: `playlist:${playlist.id}:${playlist.nextCheckAt}`,
          })(playlist);
        }
        await this.dispatchRecords();
      },
      { name: 'library-dispatch-v1' },
    );
  }
  async start(databaseUrl: string) {
    DBOS.setConfig({
      name: 'content-use',
      applicationVersion: 'playlists-v1',
      systemDatabaseUrl: databaseUrl,
      systemDatabasePoolSize: 4,
      executorID: 'nibrun-content-use',
      enableOTLP: false,
    });
    await DBOS.launch();
    await DBOS.registerQueue('transcripts', { globalConcurrency: 4, workerConcurrency: 4 });
    await DBOS.registerQueue('media', { globalConcurrency: 1 });
    await DBOS.registerQueue('playlists', { globalConcurrency: 1 });
    await DBOS.registerQueue('dispatch', { globalConcurrency: 1 });
    // A durable minute tick discovers playlists whose own hourly deadline is due, and
    // reconciles record writes committed immediately before an interrupted enqueue.
    await DBOS.applySchedules([
      {
        scheduleName: 'library-dispatch',
        workflowFn: this.dispatchWorkflow,
        schedule: '* * * * *',
        context: null,
        queueName: 'dispatch',
      },
    ]);
    this.wake();
  }
  private async dispatchRecords() {
    let after = '';
    while (true) {
      const batch = await DBOS.runStep(() => this.jobs.pending(after), { name: 'pending-records' });
      for (const job of batch) {
        await DBOS.startWorkflow(this.recordWorkflow, {
          queueName: youtubeEmbed(job.url) ? 'transcripts' : 'media',
          workflowID: `record:${job.id}:${job.generation}`,
        })(job);
        await DBOS.runStep(() => this.jobs.acknowledge(job), { name: 'acknowledge-enqueue' });
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
    this.waking = DBOS.startWorkflow(this.dispatchWorkflow, { queueName: 'dispatch' })(
      new Date(),
      null,
    )
      .then(() => {})
      .catch((error) => console.error('Could not dispatch jobs:', message(error)))
      .finally(() => {
        this.waking = undefined;
      });
  }
  private async attempt(job: RecordJob): Promise<number | null> {
    if (this.stopped) {
      throw new Error('Worker is stopping.');
    }
    const current = await this.jobs.current(job);
    if (!current) {
      return null;
    }
    const record = await this.records.get(job);
    if (!record) {
      return null;
    }
    try {
      await this.processor.run(record);
      return null;
    } catch (error) {
      if (this.stopped) {
        throw error;
      }
      if (!(await this.jobs.current(job))) {
        return null;
      }
      return this.retry(job, current.attempts, error);
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
    await this.jobs.waiting({
      ...job,
      attempts,
      retryAt: Date.now() + delay,
      error: message(error),
    });
    return delay;
  }
  async cancel(id: string) {
    await this.processor.cancel(id);
    const workflows = await DBOS.listWorkflows({
      workflow_id_prefix: `record:${id}:`,
      status: ['PENDING', 'ENQUEUED'],
      loadInput: false,
    });
    await DBOS.cancelWorkflows(workflows.map((workflow) => workflow.workflowID));
  }
  deleteFiles(input: Actor & { id: string }) {
    return this.processor.deleteFiles(input);
  }
  mediaPath(input: Actor & { id: string; name: string }) {
    return this.processor.mediaPath(input);
  }
  async stop() {
    this.stopped = true;
    await this.processor.stop();
    await DBOS.shutdown({ workflowCompletionTimeoutMS: 1000 });
  }
}
function message(error: unknown) {
  return (error instanceof Error ? error.message : 'Processing failed. Please retry.').slice(
    0,
    1500,
  );
}
