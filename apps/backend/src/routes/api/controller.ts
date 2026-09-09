import { Elysia } from 'elysia';
import type { Auth } from '#lib/auth/better-auth.ts';
import { OWNER_USER_ID } from '#lib/auth/owner-registration.ts';
import { PlaylistParams, UpdatePlaylist } from '#routes/api/playlists/model.ts';
import {
  CreateRecord,
  EditRecord,
  ImportCaptions,
  ListRecords,
  RecordParams,
} from '#routes/api/records/model.ts';
import { mediaResponse } from '#routes/media-response.ts';
import type { PlaylistsService } from '#services/playlists/service.ts';
import type { RecordsService } from '#services/records/service.ts';
export function createApi({
  auth,
  records,
  playlists,
  origin,
}: {
  auth: Auth;
  records: RecordsService;
  playlists: PlaylistsService;
  origin: string;
}) {
  return new Elysia({ prefix: '/api' })
    .resolve(async ({ request, status }) => {
      const session = await auth.getSession(request.headers);
      if (!session || session.user.id !== OWNER_USER_ID) {
        return status(401, { message: 'Sign in with your passkey to continue.' });
      }
      return { ownerId: session.user.id };
    })
    .onBeforeHandle(({ request, status }) => {
      if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('origin') !== origin) {
        return status(403, { message: 'Request origin is not allowed.' });
      }
    })
    .get('/playlists', ({ ownerId }) => playlists.list({ ownerId }))
    .get('/playlists/:id', ({ ownerId, params }) => playlists.get({ ownerId, ...params }), {
      params: PlaylistParams,
    })
    .post(
      '/playlists',
      async ({ ownerId, body, status }) =>
        status(201, await playlists.create({ ownerId, ...body })),
      { body: CreateRecord },
    )
    .patch(
      '/playlists/:id',
      ({ ownerId, params, body }) => playlists.setEnabled({ ownerId, ...params, ...body }),
      { params: PlaylistParams, body: UpdatePlaylist },
    )
    .get(
      '/records',
      ({ ownerId, query }) =>
        records.list({
          ownerId,
          status: query.status,
          playlistId: query.playlistId,
          search: query.search ?? '',
          offset: query.offset ?? 0,
        }),
      { query: ListRecords },
    )
    .post(
      '/records',
      async ({ ownerId, body, status }) => status(201, await records.create({ ownerId, ...body })),
      { body: CreateRecord },
    )
    .get('/records/:id', ({ ownerId, params }) => records.get({ ownerId, ...params }), {
      params: RecordParams,
    })
    .patch(
      '/records/:id',
      ({ ownerId, params, body }) => records.edit({ ownerId, ...params, ...body }),
      { params: RecordParams, body: EditRecord },
    )
    .delete('/records/:id', ({ ownerId, params }) => records.remove({ ownerId, ...params }), {
      params: RecordParams,
    })
    .post('/records/:id/retry', ({ ownerId, params }) => records.retry({ ownerId, ...params }), {
      params: RecordParams,
    })
    .get(
      '/records/:id/media',
      async ({ ownerId, params, request }) =>
        mediaResponse({
          path: await records.media({ ownerId, ...params }),
          range: request.headers.get('range'),
        }),
      { params: RecordParams },
    )
    .get(
      '/records/:id/markdown',
      async ({ ownerId, params }) =>
        new Response(await records.markdown({ ownerId, ...params }), {
          headers: {
            'Content-Type': 'text/markdown; charset=utf-8',
            'Content-Disposition': `attachment; filename="${params.id}.md"`,
            'Cache-Control': 'private, no-store',
          },
        }),
      { params: RecordParams },
    )
    .post(
      '/records/:id/captions',
      ({ ownerId, params, body }) => records.importCaptions({ ownerId, ...params, ...body }),
      { params: RecordParams, body: ImportCaptions },
    );
}
