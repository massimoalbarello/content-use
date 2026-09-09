import { playlistUrl } from '#models/playlists.ts';
import {
  type Actor,
  DomainError,
  publicRecord,
  recordMarkdown,
  recordSummary,
  youtubeVideoId,
} from '#models/records.ts';
import type { RecordListInput, RecordsRepository } from '#repositories/records/repository.ts';
export type RecordsJobs = {
  wake(): void;
  cancel(id: string): Promise<void>;
  deleteFiles(input: Actor & { id: string }): Promise<void>;
  mediaPath(input: Actor & { id: string; name: string }): string;
};
export class RecordsService {
  constructor(
    private readonly repository: RecordsRepository,
    private readonly jobs: RecordsJobs,
    private readonly validateUrl: (url: string) => Promise<string>,
  ) {}
  async list(input: RecordListInput) {
    const result = await this.repository.list(input);
    const links = await this.repository.playlistLinks({
      ownerId: input.ownerId,
      ids: result.records.map((r) => r.id),
    });
    return { ...result, records: result.records.map((r) => recordSummary(r, links.get(r.id))) };
  }
  async require(input: Actor & { id: string }) {
    const record = await this.repository.get(input);
    if (!record) {
      throw new DomainError('Record not found.', 404);
    }
    return record;
  }
  async get(input: Actor & { id: string }) {
    const record = await this.require(input);
    const links = await this.repository.playlistLinks({ ownerId: input.ownerId, ids: [input.id] });
    return publicRecord(record, links.get(input.id));
  }
  async create({ ownerId, url }: Actor & { url: string }) {
    if (!youtubeVideoId(url) && playlistUrl(url)) {
      throw new DomainError('Use Add playlist to choose which videos to import from this link.');
    }
    const safeUrl = await this.validateUrl(url);
    const record = await this.repository.create({
      ownerId,
      id: `rec-${crypto.randomUUID()}`,
      url: safeUrl,
      title: safeUrl,
    });
    this.jobs.wake();
    return this.get({ ownerId, id: record.id });
  }
  async edit(input: Actor & { id: string; title: string; markdown: string }) {
    await this.require(input);
    const record = await this.repository.edit({ ...input, title: input.title.trim() });
    if (!record) {
      throw new DomainError('Wait for processing to finish before editing.', 409);
    }
    return this.get(input);
  }
  async remove(input: Actor & { id: string }) {
    await this.require(input);
    await this.repository.remove(input);
    await this.jobs.cancel(input.id);
    await this.jobs.deleteFiles(input);
    return { deleted: true };
  }
  async retry(input: Actor & { id: string }) {
    const record = await this.require(input);
    if (record.status !== 'failed' && !(record.status === 'ready' && record.error)) {
      throw new DomainError('Only records with a processing error can be retried.', 409);
    }
    await this.repository.retry(input);
    this.jobs.wake();
    return this.get(input);
  }
  async media(input: Actor & { id: string }) {
    const record = await this.require(input);
    if (!record.mediaName) {
      throw new DomainError('Media is not available yet.', 404);
    }
    return this.jobs.mediaPath({ ...input, name: record.mediaName });
  }
  async markdown(input: Actor & { id: string }) {
    return recordMarkdown(await this.require(input));
  }
}
