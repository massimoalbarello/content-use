import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { ErrorNotice } from '../components/layout/states';
import { PlaylistOverview } from '../components/records/playlist-overview';
import { RecordFilters } from '../components/records/record-filters';
import { RecordList, RecordListSkeleton } from '../components/records/record-list';
import { RecordLoadMore } from '../components/records/record-load-more';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { api, unwrap } from '../lib/api';
import { playlistOptions, recordsOptions } from '../lib/queries';
import { playlistRoute } from '../router';

export function PlaylistPage() {
  const { id } = playlistRoute.useParams();
  const client = useQueryClient();
  const query = useQuery(playlistOptions(id));
  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => unwrap(await api.playlists({ id }).patch({ enabled })),
    onSuccess: () => client.invalidateQueries({ queryKey: ['playlists'] }),
  });
  const playlist = query.data;
  return (
    <div className="mx-auto max-w-6xl px-6 py-10 sm:px-12 lg:py-14">
      <Link
        to="/playlists"
        className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} />
        All playlists
      </Link>
      <ErrorNotice error={query.error ?? toggle.error} />
      {query.error && (
        <Button variant="outline" onClick={() => void query.refetch()}>
          Try again
        </Button>
      )}
      {query.isPending && (
        <p role="status" className="py-12 text-sm text-muted-foreground">
          Loading playlist…
        </p>
      )}
      {playlist && (
        <>
          <PlaylistOverview
            playlist={playlist}
            pending={toggle.isPending}
            onToggle={(enabled) => toggle.mutate(enabled)}
          />
          <PlaylistRecords id={id} />
        </>
      )}
    </div>
  );
}

function PlaylistRecords({ id }: { id: string }) {
  const search = playlistRoute.useSearch();
  const navigate = useNavigate({ from: '/playlists/$id' });
  const records = useInfiniteQuery(recordsOptions(search.q, search.status, id));
  const total = records.data?.total;
  return (
    <section className="mt-10" aria-label="Synced records">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-medium">Synced records</h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {total?.toLocaleString()} records
        </span>
      </div>
      <Input
        aria-label="Search synced records"
        type="search"
        maxLength={200}
        placeholder="Search records and captions…"
        className="mt-5 mb-4 max-w-md"
        value={search.q}
        onChange={(event) =>
          void navigate({
            search: { ...search, q: event.target.value },
            replace: true,
          })
        }
      />
      <RecordFilters
        value={search.status ?? 'all'}
        onChange={(status) => void navigate({ search: { ...search, status } })}
      />
      <ErrorNotice error={records.isFetchNextPageError ? null : records.error} />
      {records.error && !records.isFetchNextPageError && (
        <Button variant="outline" onClick={() => void records.refetch()}>
          Try again
        </Button>
      )}
      <div aria-busy={records.isFetching}>
        {records.isPending ? (
          <RecordListSkeleton />
        ) : records.data?.records.length ? (
          <RecordList records={records.data.records} />
        ) : (
          !records.error && (
            <p className="py-10 text-sm text-muted-foreground">
              {search.q || (search.status && search.status !== 'all')
                ? 'No records match these filters.'
                : 'Records will appear after the playlist is checked.'}
            </p>
          )
        )}
      </div>
      <RecordLoadMore
        hasMore={records.hasNextPage}
        busy={records.isFetching}
        loading={records.isFetchingNextPage}
        error={records.isFetchNextPageError ? records.error : null}
        onLoadMore={() => void records.fetchNextPage({ cancelRefetch: false })}
      />
    </section>
  );
}
