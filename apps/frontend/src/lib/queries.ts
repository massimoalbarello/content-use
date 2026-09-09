import type { RecordFilter } from '@repo/backend/record';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
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
export const recordsOptions = (
  search = '',
  offset = 0,
  status: RecordFilter = 'all',
  playlistId?: string,
) =>
  queryOptions({
    queryKey: ['records', 'list', search, offset, status, playlistId],
    placeholderData: keepPreviousData,
    queryFn: async () =>
      unwrap(await api.records.get({ query: { search, offset, status, playlistId } })),
    refetchInterval: 5000,
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
