import { type Actor, type ContentRecord, youtubeEmbed } from '#models/records.ts';
import type { RecordsRepository } from '#repositories/records/repository.ts';

type Pipeline = {
  download(input: {
    record: ContentRecord;
    signal: AbortSignal;
  }): Promise<{ name: string; title: string; type: 'audio' | 'video'; duration: number | null }>;
  captions(input: {
    record: ContentRecord;
    signal: AbortSignal;
  }): Promise<{ markdown: string; title: string; duration: number | null }>;
  mediaPath(input: Actor & { id: string; name: string }): string;
  deleteFiles(input: Actor & { id: string }): Promise<void>;
};
export class RecordProcessor {
  private readonly active = new Map<string, { controller: AbortController; done: Promise<void> }>();
  constructor(
    private readonly repository: RecordsRepository,
    private readonly pipeline: Pipeline,
  ) {}
  async run(record: ContentRecord) {
    const controller = new AbortController();
    let finish!: () => void;
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    this.active.set(record.id, { controller, done });
    try {
      await this.process(record, controller.signal);
    } finally {
      this.active.delete(record.id);
      finish();
    }
  }
  async cancel(id: string) {
    const task = this.active.get(id);
    task?.controller.abort();
    await task?.done;
  }
  async stop() {
    for (const task of this.active.values()) {
      task.controller.abort();
    }
    await Promise.all([...this.active.values()].map((task) => task.done));
  }
  deleteFiles(input: Actor & { id: string }) {
    return this.pipeline.deleteFiles(input);
  }
  mediaPath(input: Actor & { id: string; name: string }) {
    return this.pipeline.mediaPath(input);
  }
  private async process(record: ContentRecord, signal: AbortSignal) {
    let captionError: unknown;
    let markdown = record.markdown;
    if (!markdown) {
      await this.repository.progress({
        ...record,
        status: 'downloading',
        progress: 'Looking for original captions',
      });
      try {
        const captions = await this.pipeline.captions({ record, signal });
        signal.throwIfAborted();
        markdown = captions.markdown;
        // Persist captions before attempting media, so a blocked download cannot discard them.
        await this.repository.saveCaptions({ ...record, ...captions });
        record = (await this.repository.get(record))!;
      } catch (error) {
        signal.throwIfAborted();
        captionError = error;
      }
    }
    if (youtubeEmbed(record.url)) {
      if (captionError) {
        throw captionError;
      }
      await this.complete(record, markdown);
      return;
    }
    let mediaError: unknown;
    if (!record.mediaName) {
      await this.repository.progress({
        ...record,
        status: 'downloading',
        progress: 'Downloading media with yt-dlp',
      });
      try {
        const media = await this.pipeline.download({ record, signal });
        signal.throwIfAborted();
        await this.repository.media({ ...record, ...media });
      } catch (error) {
        signal.throwIfAborted();
        mediaError = error;
      }
    }
    if (mediaError && !markdown) {
      throw mediaError;
    }
    await this.complete(record, markdown, mediaError ?? captionError);
  }
  private async complete(record: ContentRecord, markdown: string, error?: unknown) {
    await this.repository.finish({ ...record, markdown });
    await this.repository.progress({
      ...record,
      status: 'ready',
      progress: markdown ? 'Captions ready' : 'No captions available',
      error: error ? friendlyError(error) : null,
    });
  }
}
export function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Processing failed. Retry this record.';
  if (/confirm.*not a bot|sign in to confirm/i.test(message)) {
    return 'YouTube blocked caption retrieval. The embedded video is available; retry captions later.';
  }
  return message.slice(0, 1500);
}
