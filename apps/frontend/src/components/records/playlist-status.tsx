import type { Playlist, PlaylistPoll } from '@repo/backend/playlist';
import { ChevronDown, LoaderCircle } from 'lucide-react';

type View = Omit<Playlist, 'ownerId'>;
export function PlaylistStatus({ playlist }: { playlist: View }) {
  const latest = playlist.polls[0];
  const checking = playlist.enabled && latest?.status === 'checking';
  const last = playlist.polls.find((poll) => poll.finishedAt);
  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
        <Metric label="Last check">
          <DateLabel value={last?.finishedAt ?? playlist.checkedAt} />
        </Metric>
        <Metric label="Next check">
          {!playlist.enabled ? (
            'Paused'
          ) : checking ? (
            'After this check'
          ) : (
            <DateLabel value={playlist.nextCheckAt} upcoming />
          )}
        </Metric>
        <Metric label="Captions waiting">
          {playlist.pendingCount.toLocaleString()}
          {playlist.activeCount > 0 && (
            <span className="ml-1 font-normal text-muted-foreground">
              · {playlist.activeCount} processing
            </span>
          )}
        </Metric>
        <Metric label="Captions errors">
          <span className={playlist.failedCount ? 'text-destructive' : undefined}>
            {playlist.failedCount.toLocaleString()}
          </span>
        </Metric>
      </div>
      {checking && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
          <LoaderCircle size={12} className="motion-safe:animate-spin" />
          {latest.attempts > 1
            ? `Retrying check · attempt ${latest.attempts}`
            : 'Checking for new videos…'}
        </p>
      )}
      {playlist.error && (
        <p className="mt-3 text-xs leading-5 text-destructive break-words">
          Check failed: {playlist.error}
          {playlist.enabled ? ' Retrying automatically.' : ''}
        </p>
      )}
      {playlist.retryAt && playlist.pendingCount > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Next captions retry: <DateLabel value={playlist.retryAt} upcoming />. Waiting records
          resume automatically.
        </p>
      )}
      {last?.status === 'succeeded' && (
        <p className="mt-3 text-xs text-muted-foreground">
          Last check: <PollCounts poll={last} />
        </p>
      )}
      <details className="group mt-3 text-xs">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronDown size={13} className="transition-transform group-open:rotate-180" />
          Recent checks
        </summary>
        <div className="mt-2 border-t border-border">
          {playlist.polls.length ? (
            playlist.polls.map((poll) => (
              <div key={poll.id} className="border-b border-border/60 py-2.5 last:border-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <DateLabel value={poll.finishedAt ?? poll.startedAt} />
                  <span
                    className={
                      poll.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'
                    }
                  >
                    {poll.status === 'succeeded' ? <PollCounts poll={poll} /> : labels[poll.status]}
                    {poll.attempts > 1 && ` · ${poll.attempts} attempts`}
                  </span>
                </div>
                {poll.error && (
                  <p className="mt-1 break-words leading-5 text-destructive">{poll.error}</p>
                )}
              </div>
            ))
          ) : (
            <p className="py-3 text-muted-foreground">History will appear after the next check.</p>
          )}
        </div>
        {playlist.polls.length >= 10 && (
          <p className="mt-1 text-muted-foreground">Showing the latest 10 checks.</p>
        )}
      </details>
    </>
  );
}
const labels = { checking: 'Checking', failed: 'Failed', cancelled: 'Paused' };
function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-xs font-medium tabular-nums">{children}</p>
    </div>
  );
}
function PollCounts({ poll }: { poll: PlaylistPoll }) {
  return (
    <>
      {poll.scannedCount} checked · {poll.addedCount} new
      {Boolean(poll.linkedCount) && ` · ${poll.linkedCount} existing linked`}
    </>
  );
}
export function DateLabel({
  value,
  upcoming = false,
}: {
  value: string | null;
  upcoming?: boolean;
}) {
  if (!value) {
    return <>Not yet</>;
  }
  const date = new Date(value);
  const label =
    upcoming && date.getTime() <= Date.now()
      ? 'Due now'
      : date.toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
  return (
    <time dateTime={value} title={date.toLocaleString()}>
      {label}
    </time>
  );
}
