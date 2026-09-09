import { DomainError } from './records';
export type Playlist = {
  id: string;
  ownerId: string;
  youtubeId: string;
  url: string;
  title: string;
  enabled: boolean;
  checkedAt: string | null;
  nextCheckAt: string;
  error: string | null;
  videoCount: number;
  readyCount: number;
  pendingCount: number;
  failedCount: number;
  activeCount: number;
  retryAt: string | null;
  polls: PlaylistPoll[];
};
export type PlaylistPoll = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'checking' | 'succeeded' | 'failed' | 'cancelled';
  attempts: number;
  scannedCount: number | null;
  addedCount: number | null;
  linkedCount: number | null;
  error: string | null;
};
export type PlaylistVideo = { id: string; title: string; duration?: number | null };
export function playlistUrl(source: string): { id: string; url: string } | null {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return null;
  }
  if (
    !['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(
      url.hostname,
    )
  ) {
    return null;
  }
  const id = url.searchParams.get('list');
  if (!id) {
    return null;
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !/^(PL|UU|LL|FL)[a-zA-Z0-9_-]{10,100}$/.test(id)
  ) {
    throw new DomainError(
      'Use a public YouTube playlist link. Personal mixes and Watch Later lists are not supported.',
    );
  }
  return { id, url: `https://www.youtube.com/playlist?list=${id}` };
}
export function publicPlaylist({ ownerId: _owner, ...playlist }: Playlist) {
  return playlist;
}
