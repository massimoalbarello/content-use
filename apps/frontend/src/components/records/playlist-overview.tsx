import type { Playlist } from '@repo/backend/playlist';
import { ArrowUpRight, Pause, Play } from 'lucide-react';
import { Button } from '../ui/button';
import { PlaylistStatus } from './playlist-status';
export function PlaylistOverview({
  playlist,
  pending,
  onToggle,
}: {
  playlist: Omit<Playlist, 'ownerId'>;
  pending: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <>
      {' '}
      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-3xl font-medium tracking-tight">{playlist.title}</h1>
          <p className="mt-3 text-xs text-muted-foreground">
            {playlist.videoCount} records · {playlist.readyCount} completed
          </p>
          <a
            href={playlist.url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Open on YouTube
            <ArrowUpRight size={12} />
          </a>
        </div>
        <Button
          variant="outline"
          disabled={pending}
          aria-label={playlist.enabled ? 'Pause playlist updates' : 'Resume playlist updates'}
          onClick={() => onToggle(!playlist.enabled)}
        >
          {playlist.enabled ? <Pause size={14} /> : <Play size={14} />}
          {playlist.enabled ? 'Pause updates' : 'Resume updates'}
        </Button>
      </div>
      <section aria-label="Playlist activity" className="mt-7 rounded-xl border border-border p-5">
        <h2 className="text-sm font-medium">
          {playlist.enabled ? 'Hourly updates' : 'Updates paused'}
        </h2>
        <PlaylistStatus playlist={playlist} />
        {!playlist.enabled && (
          <p className="mt-3 text-xs text-muted-foreground">
            Your records stay available. Queued captions will still finish.
          </p>
        )}
      </section>
    </>
  );
}
