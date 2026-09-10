import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { ErrorNotice } from '../components/layout/states';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { api, unwrap } from '../lib/api';
import { playlistPreviewOptions } from '../lib/queries';
import { newPlaylistRoute } from '../router';
import { PlaylistSelection } from './playlist-selection';

export function NewPlaylist() {
  const { url } = newPlaylistRoute.useSearch();
  const navigate = useNavigate({ from: '/playlists/new' });
  const client = useQueryClient();
  const create = useMutation({
    mutationFn: async (value: { url: string; videoIds: string[] }) =>
      unwrap(await api.playlists.post(value)),
    onSuccess: async ({ id }) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['records'] }),
        client.invalidateQueries({ queryKey: ['playlists'] }),
      ]);
      await navigate({ to: '/playlists/$id', params: { id }, search: { q: '' } });
    },
  });
  const preview = useQuery(playlistPreviewOptions(url));
  const form = useForm({
    defaultValues: { url },
    onSubmit: async ({ value }) => {
      create.reset();
      const nextUrl = value.url.trim();
      if (nextUrl === url) {
        await preview.refetch();
      } else {
        await navigate({ search: { url: nextUrl } });
      }
    },
  });
  return (
    <div className="mx-auto max-w-3xl px-6 py-10 sm:px-12 lg:py-14">
      <Link
        to="/playlists"
        className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} /> All playlists
      </Link>
      <h1 className="mt-10 text-3xl font-medium tracking-tight">Add playlist</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Find a public YouTube playlist, then choose the videos to add to your library.
      </p>
      <form
        className="mt-9 space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="url">
          {(field) => (
            <div>
              <label htmlFor="playlist-url" className="text-sm font-medium">
                YouTube playlist URL
              </label>
              <Input
                id="playlist-url"
                type="url"
                autoFocus
                required
                maxLength={4096}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="https://www.youtube.com/playlist?list=…"
                className="mt-2 h-11"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                disabled={preview.isFetching || create.isPending}
              />
            </div>
          )}
        </form.Field>
        <Button type="submit" disabled={preview.isFetching || create.isPending}>
          {preview.isFetching ? 'Finding videos…' : 'Find videos'}
        </Button>
      </form>
      <ErrorNotice error={preview.error} />
      {preview.isFetching && (
        <p role="status" className="mt-6 text-sm text-muted-foreground">
          Loading available videos…
        </p>
      )}
      {preview.data && !preview.isFetching && !preview.isError && (
        <PlaylistSelection
          key={`${preview.data.url}:${preview.dataUpdatedAt}`}
          playlist={preview.data}
          pending={create.isPending}
          error={create.error}
          onAdd={async (videoIds) => {
            await create.mutateAsync({ url: preview.data.url, videoIds }).catch(() => {});
          }}
        />
      )}
    </div>
  );
}
