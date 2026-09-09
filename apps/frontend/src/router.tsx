import { RECORD_FILTERS, type RecordFilter } from '@repo/backend/record';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  lazyRouteComponent,
  redirect,
} from '@tanstack/react-router';
import { Shell } from './routes/shell';

const recordSearch = (search: Record<string, unknown>): { q: string; status?: RecordFilter } => ({
  q: typeof search.q === 'string' ? search.q.slice(0, 200) : '',
  status: RECORD_FILTERS.includes(search.status as RecordFilter)
    ? (search.status as RecordFilter)
    : undefined,
});
const root = createRootRoute({
  component: Shell,
  notFoundComponent: () => (
    <div className="p-12">
      <h1 className="text-2xl">Page not found</h1>
      <Link to="/" search={{ q: '' }} className="mt-5 block underline">
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
  path: '/records/new',
  component: lazyRouteComponent(() => import('./routes/new-record'), 'NewRecord'),
});
const legacyNewRoute = createRoute({
  getParentRoute: () => root,
  path: '/new',
  beforeLoad: () => {
    throw redirect({ to: '/records/new' });
  },
});
export const newPlaylistRoute = createRoute({
  getParentRoute: () => root,
  path: '/playlists/new',
  validateSearch: (search: Record<string, unknown>) => ({
    url: typeof search.url === 'string' ? search.url.slice(0, 4096) : '',
  }),
  component: lazyRouteComponent(() => import('./routes/new-playlist'), 'NewPlaylist'),
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
  scrollRestoration: true,
  routeTree: root.addChildren([
    dashboardRoute,
    newRoute,
    legacyNewRoute,
    newPlaylistRoute,
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
