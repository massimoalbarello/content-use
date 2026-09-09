import { RECORD_FILTERS, type RecordFilter } from '@repo/backend/record';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  lazyRouteComponent,
} from '@tanstack/react-router';
import { Shell } from './routes/shell';

const recordSearch = (
  search: Record<string, unknown>,
): { q: string; offset: number; status?: RecordFilter } => ({
  q: typeof search.q === 'string' ? search.q.slice(0, 200) : '',
  offset: Math.floor(Math.max(0, Math.min(1000000, Number(search.offset) || 0))),
  status: RECORD_FILTERS.includes(search.status as RecordFilter)
    ? (search.status as RecordFilter)
    : undefined,
});
const root = createRootRoute({
  component: Shell,
  notFoundComponent: () => (
    <div className="p-12">
      <h1 className="text-2xl">Page not found</h1>
      <Link to="/" search={{ q: '', offset: 0 }} className="mt-5 block underline">
        Back to records
      </Link>
    </div>
  ),
});
export const dashboardRoute = createRoute({
  getParentRoute: () => root,
  path: '/',
  validateSearch: recordSearch,
  component: lazyRouteComponent(() => import('./routes/dashboard'), 'Dashboard'),
});
export const newRoute = createRoute({
  getParentRoute: () => root,
  path: '/new',
  component: lazyRouteComponent(() => import('./routes/new-record'), 'NewRecord'),
});
export const recordRoute = createRoute({
  getParentRoute: () => root,
  path: '/records/$id',
  component: lazyRouteComponent(() => import('./routes/record'), 'RecordPage'),
});
export const playlistsRoute = createRoute({
  getParentRoute: () => root,
  path: '/playlists',
  component: lazyRouteComponent(() => import('./routes/playlists'), 'PlaylistsPage'),
});
export const playlistRoute = createRoute({
  getParentRoute: () => root,
  path: '/playlists/$id',
  validateSearch: recordSearch,
  component: lazyRouteComponent(() => import('./routes/playlist'), 'PlaylistPage'),
});
export const settingsRoute = createRoute({
  getParentRoute: () => root,
  path: '/settings',
  component: lazyRouteComponent(() => import('./routes/settings'), 'Settings'),
});
export const accountsRoute = createRoute({
  getParentRoute: () => root,
  path: '/accounts',
  component: lazyRouteComponent(() => import('./routes/accounts'), 'AccountsPage'),
});
export const newAccountRoute = createRoute({
  getParentRoute: () => root,
  path: '/accounts/new',
  component: lazyRouteComponent(() => import('./routes/new-account'), 'NewAccount'),
});
export const accountRoute = createRoute({
  getParentRoute: () => root,
  path: '/accounts/$id',
  component: lazyRouteComponent(() => import('./routes/account'), 'AccountPage'),
});
export const router = createRouter({
  routeTree: root.addChildren([
    dashboardRoute,
    newRoute,
    recordRoute,
    playlistsRoute,
    playlistRoute,
    settingsRoute,
    accountsRoute,
    newAccountRoute,
    accountRoute,
  ]),
});
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
