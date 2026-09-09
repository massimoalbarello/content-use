export const RECORD_STATUSES = [
  'queued',
  'downloading',
  'transcribing',
  'ready',
  'failed',
] as const;
export const RECORD_FILTERS = ['all', 'ready', 'processing', 'queued', 'failed'] as const;
export type RecordFilter = (typeof RECORD_FILTERS)[number];
export type PlaylistLink = { id: string; title: string };
export type RecordStatus = (typeof RECORD_STATUSES)[number];
export type ContentRecord = {
  id: string;
  ownerId: string;
  title: string;
  url: string;
  markdown: string;
  status: RecordStatus;
  progress: string;
  error: string | null;
  mediaName: string | null;
  mediaType: 'audio' | 'video' | null;
  duration: number | null;
  createdAt: string;
  updatedAt: string;
};
export type RecordSummary = Omit<ContentRecord, 'ownerId' | 'markdown' | 'mediaName'> & {
  thumbnailUrl: string | null;
  hasTranscript: boolean;
  playlists: PlaylistLink[];
};
export type RecordView = Omit<ContentRecord, 'ownerId' | 'mediaName'> & {
  mediaUrl: string | null;
  embedUrl: string | null;
  playlists: PlaylistLink[];
};
export type Actor = { ownerId: string };
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 | 409 | 503 = 400,
  ) {
    super(message);
  }
}
export function publicRecord(record: ContentRecord, playlists: PlaylistLink[] = []): RecordView {
  const { ownerId: _owner, mediaName, ...view } = record;
  return {
    ...view,
    playlists,
    embedUrl: youtubeEmbed(record.url),
    mediaUrl: mediaName ? `/api/records/${record.id}/media` : null,
  };
}
export function recordSummary(
  record: ContentRecord,
  playlists: PlaylistLink[] = [],
): RecordSummary {
  const { ownerId: _owner, markdown: _markdown, mediaName: _file, ...summary } = record;
  const videoId = youtubeVideoId(record.url);
  return {
    ...summary,
    playlists,
    hasTranscript: Boolean(_markdown),
    thumbnailUrl: videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : null,
  };
}
export function recordMarkdown(record: ContentRecord): string {
  const tag = record.mediaType === 'audio' ? 'audio' : 'video';
  const title = record.title.replace(/[\r\n]/g, ' ');
  const embed = youtubeEmbed(record.url);
  const player = record.mediaName
    ? `<${tag} controls src="/api/records/${record.id}/media"></${tag}>`
    : embed
      ? `<iframe src="${embed}" title="YouTube video" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`
      : '';
  return `# ${title}\n\n[Original source](<${record.url}>)\n\n${player}\n\n## Transcript\n\n${record.markdown}\n`;
}

export function youtubeEmbed(source: string): string | null {
  const id = youtubeVideoId(source);
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}

export function youtubeVideoId(source: string): string | null {
  try {
    const url = new URL(source);
    if (!['https:', 'http:'].includes(url.protocol)) {
      return null;
    }
    const host = url.hostname.toLowerCase();
    const id =
      host === 'youtu.be'
        ? url.pathname.slice(1)
        : ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)
          ? (url.searchParams.get('v') ??
            url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1])
          : null;
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function mediaDuration(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}
