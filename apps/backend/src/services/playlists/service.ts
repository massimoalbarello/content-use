import { type PlaylistVideo, playlistUrl, publicPlaylist } from '#models/playlists.ts';
import { type Actor, DomainError } from '#models/records.ts';
import type { PlaylistsRepository } from '#repositories/playlists/repository.ts';

export interface PlaylistsDiscovery {
  list(url: string, signal: AbortSignal): Promise<{ title: string; videos: PlaylistVideo[] }>;
}

export class PlaylistsService {
  constructor(
    private readonly repository: PlaylistsRepository,
    private readonly jobs: { wake(): void },
    private readonly discovery: PlaylistsDiscovery,
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
  async preview(input: Actor & { url: string }, signal: AbortSignal) {
    const source = playlistUrl(input.url);
    if (!source) {
      throw new DomainError('Use a public YouTube playlist URL.');
    }
    try {
      const listing = await this.discovery.list(
        source.url,
        AbortSignal.any([signal, AbortSignal.timeout(90000)]),
      );
      return {
        youtubeId: source.id,
        url: source.url,
        title: listing.title,
        videos: [...new Map(listing.videos.map((video) => [video.id, video])).values()],
      };
    } catch {
      throw new DomainError(
        'Could not load videos from YouTube. Check that the playlist is public and try again.',
        503,
      );
    }
  }
  async create(input: Actor & { url: string; videoIds: string[] }, signal: AbortSignal) {
    const source = await this.preview(input, signal);
    const available = new Set(source.videos.map((video) => video.id));
    const selected = [...new Set(input.videoIds)];
    if (!selected.length) {
      throw new DomainError('Select at least one video.');
    }
    if (selected.some((id) => !available.has(id))) {
      throw new DomainError(
        'A selected video is no longer available. Find the videos again and update your selection.',
      );
    }
    const id = await this.repository.importSelected({
      ownerId: input.ownerId,
      ...source,
      videoIds: selected,
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
