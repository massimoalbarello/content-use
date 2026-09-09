import type { RecordSummary } from '@repo/backend/record';
import { Link } from '@tanstack/react-router';
import { AudioLines, Film } from 'lucide-react';
import { useState } from 'react';
import { PlaylistTags } from './playlist-tags';
import { durationLabel, Status } from './status';

function RecordThumbnail({ record }: { record: RecordSummary }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/70 sm:w-20">
      {record.thumbnailUrl && !failed ? (
        <img
          src={record.thumbnailUrl}
          alt=""
          width={48}
          height={48}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : record.mediaType === 'audio' ? (
        <AudioLines className="size-5" strokeWidth={1.5} />
      ) : (
        <Film className="size-5" strokeWidth={1.5} />
      )}
    </span>
  );
}

export function RecordList({ records }: { records: RecordSummary[] }) {
  return (
    <div>
      <div className="hidden grid-cols-[minmax(0,1fr)_70px_115px_65px] gap-4 border-b border-border pb-3 text-[11px] uppercase tracking-widest text-muted-foreground lg:grid">
        <span>Record</span>
        <span>Duration</span>
        <span>Status</span>
        <span>Added</span>
      </div>
      {records.map((record) => (
        <div
          key={record.id}
          className="grid items-center gap-4 border-b border-border py-5 transition-colors hover:bg-muted/40 lg:grid-cols-[minmax(0,1fr)_70px_115px_65px]"
        >
          <div className="flex min-w-0 items-center gap-4">
            <Link
              to="/records/$id"
              params={{ id: record.id }}
              aria-label={`Open ${record.title}`}
              className="shrink-0"
            >
              <RecordThumbnail key={record.thumbnailUrl} record={record} />
            </Link>
            <div className="min-w-0">
              <h3
                className="line-clamp-2 break-words text-sm font-medium leading-6 lg:truncate"
                title={record.title}
              >
                <Link to="/records/$id" params={{ id: record.id }} className="hover:underline">
                  {record.title}
                </Link>
              </h3>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {new URL(record.url).hostname.replace(/^www\./, '')}
              </p>
              <PlaylistTags playlists={record.playlists} />
              <div className="mt-2 flex items-center gap-3 lg:hidden">
                <Status status={record.status} hasTranscript={record.hasTranscript} />
                {record.duration !== null && (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {durationLabel(record.duration)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <span className="hidden text-xs tabular-nums text-muted-foreground lg:block">
            {durationLabel(record.duration)}
          </span>
          <span className="hidden lg:block">
            <Status status={record.status} hasTranscript={record.hasTranscript} />
          </span>
          <span className="hidden text-xs text-muted-foreground lg:block">
            {new Date(record.createdAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        </div>
      ))}
    </div>
  );
}

export function RecordListSkeleton() {
  return (
    <div role="status">
      <span className="sr-only">Loading records…</span>
      <div aria-hidden="true" className="motion-safe:animate-pulse">
        {[1, 2, 3, 4].map((row) => (
          <div key={row} className="flex items-center gap-4 border-b border-border py-5">
            <div className="size-12 shrink-0 rounded-lg bg-muted sm:w-20" />
            <div className="w-full max-w-sm space-y-3">
              <div className="h-3 w-4/5 rounded bg-muted" />
              <div className="h-2.5 w-1/3 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
