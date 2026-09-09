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
