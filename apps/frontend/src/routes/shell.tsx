import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Outlet } from '@tanstack/react-router';
import { Library, ListVideo, LockKeyhole, LogOut, Settings2, Users } from 'lucide-react';
import { Brand } from '../components/layout/brand';
import { ErrorNotice, Loading } from '../components/layout/states';
import { Button } from '../components/ui/button';
import { authClient } from '../lib/auth';
import { sessionOptions } from '../lib/queries';
import { Login } from './login';
export function Shell() {
  const session = useQuery(sessionOptions);
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: async () => {
      const result = await authClient.signOut();
      if (result.error) {
        throw new Error(result.error.message);
      }
    },
    onSuccess: () => {
      queryClient.clear();
      window.location.assign('/');
    },
  });
  if (session.isPending) {
    return <Loading />;
  }
  if (session.error) {
    return (
      <main className="m-10">
        <ErrorNotice error={session.error} />
        <Button
          onClick={() => {
            void session.refetch();
          }}
        >
          Try again
        </Button>
      </main>
    );
  }
  if (!session.data) {
    return <Login />;
  }
  return (
    <div className="min-h-screen md:grid md:grid-cols-[224px_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-background focus:p-3 focus:text-sm"
      >
        Skip to content
      </a>
      <aside className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-sidebar p-5 md:sticky md:top-0 md:h-screen md:flex-col md:items-stretch md:justify-start md:border-b-0 md:border-r md:px-5 md:py-8">
        <Link to="/" search={{ q: '', offset: 0 }} aria-label="Content Use home">
          <Brand />
        </Link>
        <div className="hidden mt-10 mb-3 text-[10px] uppercase tracking-widest text-muted-foreground md:block">
          Workspace
        </div>
        <nav
          aria-label="Main navigation"
          className="order-last flex w-full flex-wrap gap-1 md:order-none md:w-auto md:flex-col"
        >
          <Link
            to="/"
            search={{ q: '', offset: 0 }}
            activeOptions={{ exact: true, includeSearch: false }}
            activeProps={{ className: 'bg-sidebar-accent font-medium text-foreground' }}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground"
          >
            <Library size={17} />
            Records
          </Link>
          <Link
            to="/playlists"
            activeProps={{ className: 'bg-sidebar-accent font-medium text-foreground' }}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground"
          >
            <ListVideo size={17} />
            Playlists
          </Link>
          <Link
            to="/accounts"
            activeProps={{ className: 'bg-sidebar-accent font-medium text-foreground' }}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground"
          >
            <Users size={17} />
            Accounts
          </Link>
          <Link
            to="/settings"
            activeProps={{ className: 'bg-sidebar-accent font-medium text-foreground' }}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground"
          >
            <Settings2 size={17} />
            Settings
          </Link>
        </nav>
        <div className="md:mt-auto">
          <div className="mb-4 hidden items-center gap-2 px-3 text-xs text-muted-foreground md:flex">
            <LockKeyhole size={13} />
            Private workspace
          </div>
          <Button
            variant="ghost"
            aria-label="Sign out"
            title="Sign out"
            className="text-muted-foreground"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            <LogOut size={15} />
            <span className="hidden md:inline">Sign out</span>
          </Button>
          <ErrorNotice error={logout.error} />
        </div>
      </aside>
      <main id="main" tabIndex={-1} className="min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
