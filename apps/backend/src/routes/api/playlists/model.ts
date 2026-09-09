import { t } from 'elysia';
export const PlaylistParams = t.Object({ id: t.String({ pattern: '^pl-[0-9a-f-]{36}$' }) });
export const UpdatePlaylist = t.Object({ enabled: t.Boolean() });
