import { Elysia, t } from 'elysia';
import type { Auth } from '#lib/auth/better-auth.ts';
import { OWNER_USER_ID } from '#lib/auth/owner-registration.ts';
import { DomainError } from '#models/records.ts';
import { RecordParams } from '#routes/api/records/model.ts';
import type { UtilintService } from '#services/utilint/service.ts';
export function utilintRoutes({
  auth,
  utilint,
  origin,
}: {
  auth: Auth;
  utilint: UtilintService;
  origin: string;
}) {
  return (
    new Elysia({ prefix: '/api' })
      // Keep old bookmarks and cached login pages working through the single callback.
      .get('/utilint/start', ({ redirect }) =>
        redirect('/api/utilint/callback?utilint_connect=1', 303),
      )
      .get('/utilint/callback', async ({ request, redirect }) => {
        const url = new URL(request.url);
        const initiating =
          url.searchParams.size === 1 && url.searchParams.get('utilint_connect') === '1';
        const session = await auth.getSession(request.headers);
        const target = new URL('/utilint/complete', origin);
        target.searchParams.set('status', 'failed');
        if (!session || session.user.id !== OWNER_USER_ID) {
          return initiating ? redirect('/?connect=utilint', 303) : redirect(target.href, 303);
        }
        const actor = { ownerId: session.user.id, sessionId: session.session.id };
        if (initiating) {
          const result = await utilint.begin(actor);
          return redirect(result.url, 303);
        }
        // A malformed or mixed response must never start a new attempt or accept a code.
        if (url.searchParams.has('utilint_connect')) {
          return redirect(target.href, 303);
        }
        try {
          const result = await utilint.complete(actor, url);
          target.searchParams.set('status', 'connected');
          if (result.recordId) {
            target.searchParams.set('record', result.recordId);
          }
        } catch {
          // Show a clean failure URL, without exposing callback codes or state.
        }
        return redirect(target.href, 303);
      })
      .resolve(async ({ request }) => {
        const session = await auth.getSession(request.headers);
        if (!session || session.user.id !== OWNER_USER_ID) {
          throw new DomainError('Sign in with your passkey to continue.', 401);
        }
        if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('origin') !== origin) {
          throw new DomainError('Request origin is not allowed.', 403);
        }
        return { actor: { ownerId: session.user.id, sessionId: session.session.id } };
      })
      .get('/utilint', ({ actor }) => utilint.status(actor.ownerId))
      .put('/utilint/client', ({ actor, body }) => utilint.configure(actor.ownerId, body), {
        body: t.Object({
          origin: t.String({ format: 'uri', maxLength: 2000 }),
          clientId: t.String({ minLength: 1, maxLength: 200 }),
          clientSecret: t.String({ minLength: 1, maxLength: 2000 }),
        }),
      })
      .post('/utilint/connect', ({ actor, body }) => utilint.begin(actor, body.recordId), {
        body: t.Object({ recordId: t.Optional(RecordParams.properties.id) }),
      })
      .delete('/utilint/connection', ({ actor }) => utilint.disconnect(actor.ownerId))
      .get(
        '/records/:id/summary',
        ({ actor, params }) => utilint.summary({ ownerId: actor.ownerId, id: params.id }),
        { params: RecordParams },
      )
      .post(
        '/records/:id/summary',
        ({ actor, params }) => utilint.generate({ ownerId: actor.ownerId, id: params.id }),
        { params: RecordParams },
      )
  );
}
