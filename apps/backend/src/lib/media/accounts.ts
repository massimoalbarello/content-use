import { type AccountDiscovery, type AccountPlaylist, accountUrl } from '#models/accounts.ts';
import { playlistUrl } from '#models/playlists.ts';
import type { MediaPipeline } from './pipeline';
import { youtubeListing } from './youtube-listing';

export class YoutubeAccounts {
  constructor(
    private readonly pipeline: Pick<MediaPipeline, 'binaries'>,
    private readonly dataFolder: string,
  ) {}
  async list(url: string, signal: AbortSignal) {
    const source = accountUrl(url);
    const input = { pipeline: this.pipeline, dataFolder: this.dataFolder, limit: 1000, signal };
    try {
      return parseAccount(await youtubeListing({ ...input, url: source }));
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes('This channel does not have a playlists tab')
      ) {
        throw error;
      }
      // yt-dlp's about extraction returns channel metadata with no entries.
      return parseAccount(
        await youtubeListing({ ...input, url: source.replace(/\/playlists$/, '/about') }),
      );
    }
  }
}

export function parseAccount(json: string): AccountDiscovery {
  const data = JSON.parse(json);
  if (
    data?._type !== 'playlist' ||
    !/^UC[a-zA-Z0-9_-]{22}$/.test(data.channel_id ?? '') ||
    typeof data.channel !== 'string' ||
    !data.channel.trim() ||
    !Array.isArray(data.entries)
  ) {
    throw new Error('YouTube did not return a public account.');
  }
  if (data.entries.length > 1000) {
    throw new Error('This account exceeds the 1,000 playlist limit.');
  }
  const playlists = new Map<string, AccountPlaylist>();
  for (const entry of data.entries) {
    if (!entry || ['private', 'unlisted', 'needs_auth'].includes(entry.availability)) {
      continue;
    }
    let source: ReturnType<typeof playlistUrl>;
    try {
      source = playlistUrl(`https://www.youtube.com/playlist?list=${entry.id}`);
    } catch {
      continue;
    }
    if (source) {
      playlists.set(source.id, {
        youtubeId: source.id,
        url: source.url,
        title: typeof entry.title === 'string' ? entry.title.slice(0, 300) : source.url,
      });
    }
  }
  return {
    youtubeId: data.channel_id,
    url: `https://www.youtube.com/channel/${data.channel_id}`,
    title: data.channel.slice(0, 300),
    playlists: [...playlists.values()],
  };
}
