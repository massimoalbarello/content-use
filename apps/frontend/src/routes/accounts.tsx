import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { ErrorNotice } from '../components/layout/states';
import { Button } from '../components/ui/button';
import { accountsOptions } from '../lib/queries';

export function AccountsPage() {
  const query = useQuery(accountsOptions);
  return (
    <div className="mx-auto max-w-6xl px-6 py-10 sm:px-12 lg:py-14">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <h1 className="text-3xl font-medium tracking-tight">Accounts</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Discover public YouTube playlists and choose which ones to follow.
          </p>
        </div>
        <Link
          to="/accounts/new"
          className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-sm text-background"
        >
          <Plus size={16} /> Add account
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
          Loading accounts…
        </p>
      ) : query.data?.length ? (
        <ul className="mt-9 divide-y divide-border border-t border-border">
          {query.data.map((account) => (
            <li key={account.id} className="py-5">
              <Link
                to="/accounts/$id"
                params={{ id: account.id }}
                className="break-words text-sm font-medium hover:underline"
              >
                {account.title}
              </Link>
              <p className="mt-1 text-xs text-muted-foreground">YouTube · View public playlists</p>
            </li>
          ))}
        </ul>
      ) : (
        !query.error && (
          <div className="py-20 text-center">
            <h2 className="font-medium">No accounts yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Add a YouTube handle or channel URL to discover its public playlists.
            </p>
          </div>
        )
      )}
    </div>
  );
}
