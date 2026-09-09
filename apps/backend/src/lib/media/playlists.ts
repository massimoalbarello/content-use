import { type PlaylistVideo, playlistUrl } from '#models/playlists.ts';
import { mediaDuration } from '#models/records.ts';
import type { MediaPipeline } from './pipeline';
import { youtubeListing } from './youtube-listing';
export class YoutubePlaylists {
  constructor(
    private readonly pipeline: Pick<MediaPipeline, 'binaries'>,
    private readonly dataFolder: string,
  ) {}
  async list(url: string, signal: AbortSignal) {
    const source = playlistUrl(url);
    if (!source) {
      throw new Error('Use a public YouTube playlist URL.');
    }
    return parsePlaylist(
      await youtubeListing({
        pipeline: this.pipeline,
        dataFolder: this.dataFolder,
        url: source.url,
        limit: 10000,
        signal,
      }),
    );
  }
}
export function parsePlaylist(json: string) {
  const data = JSON.parse(json);
  if (
    data?._type !== 'playlist' ||
    typeof data.title !== 'string' ||
    !Array.isArray(data.entries)
  ) {
    throw new Error('YouTube did not return a public playlist.');
  }
  if (data.entries.length > 10000) {
    throw new Error('This playlist exceeds the 10,000 video limit.');
  }
  const videos: PlaylistVideo[] = [];
  for (const entry of data.entries) {
    if (!entry || !/^[a-zA-Z0-9_-]{11}$/.test(entry.id ?? '')) {
      continue;
    }
    if (
      ['private', 'premium_only', 'subscriber_only', 'needs_auth'].includes(entry.availability) ||
      ['[Private video]', '[Deleted video]'].includes(entry.title)
    ) {
      continue;
    }
    videos.push({
      id: entry.id,
      duration: mediaDuration(entry.duration),
      title:
        typeof entry.title === 'string'
          ? entry.title.slice(0, 300)
          : `https://www.youtube.com/watch?v=${entry.id}`,
    });
  }
  return { title: data.title.slice(0, 300) as string, videos };
}
