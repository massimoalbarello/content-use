import { t } from 'elysia';
export const PlaylistParams = t.Object({ id: t.String({ pattern: '^pl-[0-9a-f-]{36}$' }) });
export const UpdatePlaylist = t.Object({ enabled: t.Boolean() });
export const PreviewPlaylist = t.Object({ url: t.String({ minLength: 1, maxLength: 4096 }) });
export const CreatePlaylist = t.Object({
  ...PreviewPlaylist.properties,
  videoIds: t.Array(t.String({ pattern: '^[a-zA-Z0-9_-]{11}$' }), {
    minItems: 1,
    maxItems: 10000,
  }),
});
