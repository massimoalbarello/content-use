import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { ErrorNotice } from '../components/layout/states';
import { DateLabel } from '../components/records/playlist-status';
import { Button } from '../components/ui/button';
import { playlistsOptions } from '../lib/queries';

export function PlaylistsPage() {
  const query = useQuery(playlistsOptions);
  return (
    <div className="mx-auto max-w-6xl px-6 py-10 sm:px-12 lg:py-14">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <h1 className="text-3xl font-medium tracking-tight">Playlists</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Follow playlists. New videos are checked every hour.
          </p>
        </div>
        <Link
          to="/new"
          className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-sm text-background"
        >
          <Plus size={16} />
          Add playlist
        </Link>
      </div>
      <ErrorNotice error={query.error} />
      {query.error && (
        <Button variant="outline" onClick={() => void query.refetch()}>
          Try again
        </Button>
      )}
      {query.isPending ? (
        <p role="status" className="py-12 text-sm text-muted-foreground">
          Loading playlists…
        </p>
      ) : query.data?.length ? (
        <div className="mt-9 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-[11px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="pb-3 pr-5 font-normal">Playlist</th>
                <th className="hidden pb-3 pr-5 font-normal lg:table-cell">Records</th>
                <th className="hidden pb-3 pr-5 font-normal xl:table-cell">Last check</th>
                <th className="hidden pb-3 font-normal lg:table-cell">Next check</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((playlist) => (
                <tr key={playlist.id} className="border-b border-border hover:bg-muted/30">
                  <td className="max-w-0 py-5 pr-4">
                    <Link
                      to="/playlists/$id"
                      params={{ id: playlist.id }}
                      search={{ q: '', offset: 0 }}
                      className="line-clamp-2 break-words font-medium hover:underline"
                    >
                      {playlist.title}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {playlist.readyCount} completed · {playlist.pendingCount} waiting
                      {playlist.failedCount > 0 && ` · ${playlist.failedCount} failed`}
                    </p>
                  </td>
                  <td className="hidden py-5 pr-5 tabular-nums lg:table-cell">
                    {playlist.videoCount}
                  </td>
                  <td className="hidden py-5 pr-5 text-xs text-muted-foreground xl:table-cell">
                    <DateLabel
                      value={
                        playlist.polls.find((poll) => poll.finishedAt)?.finishedAt ??
                        playlist.checkedAt
                      }
                    />
                  </td>
                  <td className="hidden py-5 text-xs text-muted-foreground lg:table-cell">
                    {playlist.enabled ? (
                      <DateLabel value={playlist.nextCheckAt} upcoming />
                    ) : (
                      'Paused'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !query.error && (
          <div className="py-20 text-center">
            <h2 className="font-medium">No playlists yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Add a public YouTube playlist to start syncing its records.
            </p>
          </div>
        )
      )}
    </div>
  );
}
