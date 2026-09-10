import type { RecordFilter } from '@repo/backend/record';
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { api, unwrap } from './api';
import { authClient } from './auth';
export const sessionOptions = queryOptions({
  queryKey: ['session'],
  queryFn: async () => {
    const result = await authClient.getSession();
    if (result.error) {
      throw new Error(result.error.message ?? 'Could not check your session.');
    }
    return result.data;
  },
  retry: false,
});
export const ownerOptions = queryOptions({
  queryKey: ['owner'],
  queryFn: async () => unwrap(await api['owner-registration'].get()),
});
export const recordsOptions = (search = '', status: RecordFilter = 'all', playlistId?: string) =>
  infiniteQueryOptions({
    queryKey: ['records', 'infinite', search, status, playlistId],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) =>
      unwrap(
        await api.records.get({
          query: { search, offset: pageParam, status, playlistId },
          fetch: { signal },
        }),
      ),
    getNextPageParam: (last, _pages, offset) => {
      const next = offset + last.records.length;
      return last.records.length && next < last.total ? next : undefined;
    },
    select: (data) => ({
      ...data,
      records: [
        ...new Map(
          data.pages.flatMap((page) => page.records).map((record) => [record.id, record]),
        ).values(),
      ],
      total: data.pages[0]?.total ?? 0,
    }),
    refetchInterval: (query) => (query.state.status === 'error' ? false : 5000),
  });
export const recordOptions = (id: string) =>
  queryOptions({
    queryKey: ['records', id],
    queryFn: async () => unwrap(await api.records({ id }).get()),
    refetchInterval: (query) =>
      ['ready', 'failed'].includes(query.state.data?.status ?? '') ? false : 2500,
  });

export const playlistsOptions = queryOptions({
  queryKey: ['playlists'],
  queryFn: async () => unwrap(await api.playlists.get()),
  refetchInterval: 5000,
});

export const playlistOptions = (id: string) =>
  queryOptions({
    queryKey: ['playlists', id],
    queryFn: async () => unwrap(await api.playlists({ id }).get()),
    refetchInterval: 5000,
  });

export const accountsOptions = queryOptions({
  queryKey: ['accounts'],
  queryFn: async () => unwrap(await api.accounts.get()),
});
export const accountOptions = (id: string) =>
  queryOptions({
    queryKey: ['accounts', id],
    queryFn: async () => unwrap(await api.accounts({ id }).get()),
  });
export const accountPlaylistsOptions = (id: string) =>
  queryOptions({
    queryKey: ['accounts', id, 'discovery'],
    queryFn: async ({ signal }) =>
      unwrap(await api.accounts({ id }).playlists.get({ fetch: { signal } })),
    staleTime: 60000,
    retry: false,
    refetchOnWindowFocus: false,
  });

export const playlistPreviewOptions = (url: string) =>
  queryOptions({
    queryKey: ['playlist-preview', url],
    queryFn: async ({ signal }) =>
      unwrap(
        await api.playlists.preview.get({
          query: { url },
          fetch: { signal },
        }),
      ),
    enabled: Boolean(url),
    staleTime: Infinity,
    retry: false,
  });
