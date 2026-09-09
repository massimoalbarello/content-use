import { playlistUrl, publicPlaylist } from '#models/playlists.ts';
import { type Actor, DomainError } from '#models/records.ts';
import type { PlaylistsRepository } from '#repositories/playlists/repository.ts';
export class PlaylistsService {
  constructor(
    private readonly repository: PlaylistsRepository,
    private readonly jobs: { wake(): void },
  ) {}
  async list(actor: Actor) {
    return (await this.repository.list(actor)).map(publicPlaylist);
  }
  async get(input: Actor & { id: string }) {
    const [playlist] = await this.repository.list(input);
    if (!playlist) {
      throw new DomainError('Playlist not found.', 404);
    }
    return publicPlaylist(playlist);
  }
  async create(input: Actor & { url: string }) {
    const source = playlistUrl(input.url);
    if (!source) {
      throw new DomainError('Use a public YouTube playlist URL.');
    }
    const id = await this.repository.create({
      ...input,
      url: source.url,
      youtubeId: source.id,
      title: source.url,
    });
    this.jobs.wake();
    return { id };
  }
  async setEnabled(input: Actor & { id: string; enabled: boolean }) {
    if (!(await this.repository.setEnabled(input))) {
      throw new DomainError('Playlist not found.', 404);
    }
    this.jobs.wake();
    return { updated: true };
  }
}
