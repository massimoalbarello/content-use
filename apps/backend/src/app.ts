import { Elysia } from 'elysia';
import type { Auth } from '#lib/auth/better-auth.ts';
import { DomainError } from '#models/records.ts';
import { createApi } from '#routes/api/controller.ts';
import type { AccountsService } from '#services/accounts/service.ts';
import type { OwnerRegistrationService } from '#services/owner-registration/service.ts';
import type { PlaylistsService } from '#services/playlists/service.ts';
import type { RecordsService } from '#services/records/service.ts';
export function createApp({
  auth,
  records,
  registration,
  playlists,
  accounts,
  origin,
  assets = new Map<string, string>(),
}: {
  auth: Auth;
  records: RecordsService;
  registration: OwnerRegistrationService;
  playlists: PlaylistsService;
  accounts: AccountsService;
  origin: string;
  assets?: Map<string, string>;
}) {
  return new Elysia({ serve: { maxRequestBodySize: 2 * 1024 * 1024, idleTimeout: 120 } })
    .onError(({ error, code, status }) => {
      if (error instanceof DomainError) {
        return status(error.status, { message: error.message });
      }
      if (code === 'VALIDATION') {
        return status(400, { message: 'Check the fields and try again.' });
      }
      if (code === 'NOT_FOUND') {
        return status(404, { message: 'Not found.' });
      }
      console.error('Request failed:', error instanceof Error ? error.message : code);
      return status(500, { message: 'Something went wrong. Please try again.' });
    })
    .onAfterHandle(({ set }) => {
      set.headers['X-Content-Type-Options'] = 'nosniff';
      set.headers['Referrer-Policy'] = 'no-referrer';
      set.headers['X-Frame-Options'] = 'DENY';
      set.headers['Cache-Control'] = 'no-store';
    })
    .get('/api/health', () => ({ status: 'ok', application: 'content-use' }))
    .get('/api/owner-registration', () => registration.status())
    .get('/api/auth/*', ({ request }) => auth.handler(request), { parse: 'none' })
    .post('/api/auth/*', ({ request }) => auth.handler(request), { parse: 'none' })
    .use(createApi({ auth, records, playlists, accounts, origin }))
    .get('/*', ({ path }) => {
      if (path.startsWith('/api/')) {
        return new Response('Not found', { status: 404 });
      }
      const asset =
        assets.get(path) ?? (path.includes('.') ? undefined : assets.get('/index.html'));
      if (!asset) {
        return new Response('Not found', { status: 404 });
      }
      return new Response(Bun.file(asset), {
        headers: {
          'Content-Security-Policy':
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https://i.ytimg.com; media-src 'self'; frame-src https://www.youtube-nocookie.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
        },
      });
    });
}
