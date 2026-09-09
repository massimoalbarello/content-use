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
  return new Elysia({ prefix: '/api' })
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
    .get('/utilint/callback', async ({ actor, request, redirect }) => {
      const target = new URL('/utilint/complete', origin);
      try {
        const result = await utilint.complete(actor, new URL(request.url));
        target.searchParams.set('status', 'connected');
        if (result.recordId) {
          target.searchParams.set('record', result.recordId);
        }
      } catch {
        target.searchParams.set('status', 'failed');
      }
      return redirect(target.href, 303);
    })
    .get(
      '/records/:id/summary',
      ({ actor, params }) => utilint.summary({ ownerId: actor.ownerId, id: params.id }),
      { params: RecordParams },
    )
    .post(
      '/records/:id/summary',
      ({ actor, params }) => utilint.generate({ ownerId: actor.ownerId, id: params.id }),
      { params: RecordParams },
    );
}
