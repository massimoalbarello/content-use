import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { LoaderCircle, Plus, Search, X } from 'lucide-react';
import { ErrorNotice } from '../components/layout/states';
import { EmptyLibrary } from '../components/records/empty-library';
import { RecordFilters } from '../components/records/record-filters';
import { RecordList, RecordListSkeleton } from '../components/records/record-list';
import { RecordPagination } from '../components/records/record-pagination';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { recordsOptions } from '../lib/queries';
import { dashboardRoute } from '../router';
export function Dashboard() {
  const search = dashboardRoute.useSearch();
  const navigate = useNavigate({ from: '/' });
  const records = useQuery(recordsOptions(search.q, search.offset, search.status));
  const total = records.data?.total;
  const changeSearch = (q: string, offset = 0) => {
    void navigate({ search: { ...search, q, offset }, replace: true });
  };
  return (
    <div className="mx-auto max-w-6xl px-6 py-10 sm:px-12 lg:py-14">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Your library
        </p>
        <span className="text-xs tabular-nums text-muted-foreground">
          {total !== undefined && `${total.toLocaleString()} ${total === 1 ? 'record' : 'records'}`}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-5">
        <div>
          <h1 className="text-3xl font-medium tracking-tight">Records</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The things you watch and listen to, worth keeping.
          </p>
        </div>
        <Button
          className="h-10 px-4"
          onClick={() => {
            void navigate({ to: '/new' });
          }}
        >
          <Plus size={16} />
          New record
        </Button>
      </div>

      <div className="relative mt-9 mb-7 max-w-md">
        {records.isFetching ? (
          <LoaderCircle className="absolute left-3 top-3 size-4 text-muted-foreground motion-safe:animate-spin" />
        ) : (
          <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
        )}
        <Input
          aria-label="Search records"
          type="search"
          maxLength={200}
          placeholder="Search records and transcripts…"
          className="h-10 pl-9 pr-10 bg-muted/30 border-transparent [&::-webkit-search-cancel-button]:appearance-none"
          value={search.q}
          onChange={(event) => changeSearch(event.target.value)}
        />
        {search.q && (
          <button
            type="button"
            aria-label="Clear search"
            title="Clear search"
            className="absolute right-1 top-1 flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => changeSearch('')}
          >
            <X size={15} />
          </button>
        )}
      </div>
      <RecordFilters
        value={search.status ?? 'all'}
        onChange={(status) => void navigate({ search: { ...search, status, offset: 0 } })}
      />
      <ErrorNotice error={records.error} />
      {records.error && (
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
            <LibraryEmptyState
              filtered={Boolean(search.q || (search.status && search.status !== 'all'))}
              paged={search.offset > 0}
              onReset={() => void navigate({ search: { q: '', offset: 0 } })}
              onCreate={() => void navigate({ to: '/new' })}
            />
          )
        )}
      </div>
      <RecordPagination
        total={total}
        offset={search.offset}
        pending={records.isPlaceholderData}
        onChange={(offset) => changeSearch(search.q, offset)}
      />
    </div>
  );
}
function LibraryEmptyState({
  filtered,
  paged,
  onReset,
  onCreate,
}: {
  filtered: boolean;
  paged: boolean;
  onReset: () => void;
  onCreate: () => void;
}) {
  if (!filtered && !paged) {
    return <EmptyLibrary onCreate={onCreate} />;
  }
  return (
    <div className="py-16 text-center">
      <Search className="mx-auto mb-5 size-7 text-muted-foreground" strokeWidth={1.5} />
      <h2 className="font-medium">{filtered ? 'No matching records' : 'No more records'}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {filtered ? 'Try another title or phrase from a transcript.' : 'Return to your library.'}
      </p>
      <Button variant="outline" className="mt-5" onClick={onReset}>
        Show all records
      </Button>
    </div>
  );
}
