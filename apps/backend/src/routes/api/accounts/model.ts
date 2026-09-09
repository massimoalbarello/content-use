import { t } from 'elysia';

export const AccountParams = t.Object({ id: t.String({ pattern: '^acc-[0-9a-f-]{36}$' }) });
export const CreateAccount = t.Object({ url: t.String({ minLength: 1, maxLength: 4096 }) });
export const EditAccount = t.Object({
  title: t.String({ minLength: 1, maxLength: 300, pattern: '.*\\S.*' }),
});
export const FollowAccountPlaylists = t.Object({
  youtubeIds: t.Array(t.String({ minLength: 1, maxLength: 128 }), {
    minItems: 1,
    maxItems: 1000,
    uniqueItems: true,
  }),
});
