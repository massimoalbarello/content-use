import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { RefreshCw } from 'lucide-react';
import { ErrorNotice } from '../components/layout/states';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { api, unwrap } from '../lib/api';
import { accountPlaylistsOptions, playlistsOptions } from '../lib/queries';

export function AccountPlaylists({ id }: { id: string }) {
  const client = useQueryClient();
  const discovery = useQuery(accountPlaylistsOptions(id));
  const followed = useQuery(playlistsOptions);
  const existing = new Map(followed.data?.map((playlist) => [playlist.youtubeId, playlist]));
  const selectable =
    discovery.data?.filter((playlist) => {
      const saved = existing.get(playlist.youtubeId);
      return !saved?.enabled || !saved.account;
    }) ?? [];
  const follow = useMutation({
    mutationFn: async (youtubeIds: string[]) =>
      unwrap(await api.accounts({ id }).playlists.post({ youtubeIds })),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['playlists'] });
      form.reset();
    },
  });
  const form = useForm({
    defaultValues: { selected: [] as string[] },
    onSubmit: async ({ value }) => {
      const selected = selectable
        .filter((playlist) => value.selected.includes(playlist.youtubeId))
        .map((playlist) => playlist.youtubeId);
      await follow.mutateAsync(selected).catch(() => {});
    },
  });
  return (
    <section className="mt-10" aria-label="Public playlists">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium">Public playlists</h2>
        <Button
          variant="outline"
          disabled={discovery.isFetching || follow.isPending}
          onClick={async () => {
            follow.reset();
            const result = await discovery.refetch();
            if (!result.isError) {
              form.reset();
            }
          }}
        >
          <RefreshCw size={14} />
          {discovery.isFetching ? 'Refreshing…' : 'Refresh playlists'}
        </Button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Selected playlists import their videos and check for new additions every hour.
      </p>
      <ErrorNotice error={discovery.error ?? followed.error ?? follow.error} />
      {followed.error && (
        <Button variant="outline" onClick={() => void followed.refetch()}>
          Retry followed playlists
        </Button>
      )}
      {follow.isSuccess && (
        <p role="status" className="mt-4 text-sm">
          {follow.data.ids.length} {follow.data.ids.length === 1 ? 'playlist is' : 'playlists are'}{' '}
          now following. Captions are queued automatically.
        </p>
      )}
      {discovery.isPending || followed.isPending ? (
        <p role="status" className="py-10 text-sm text-muted-foreground">
          Loading public playlists…
        </p>
      ) : discovery.data?.length ? (
        <form
          className="mt-6"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="selected">
            {(field) => {
              const selected = selectable.filter((playlist) =>
                field.state.value.includes(playlist.youtubeId),
              );
              return (
                <>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={follow.isPending || !selectable.length || followed.isError}
                      onClick={() =>
                        field.handleChange(
                          selected.length === selectable.length
                            ? []
                            : selectable.map((playlist) => playlist.youtubeId),
                        )
                      }
                    >
                      {selected.length === selectable.length && selectable.length > 0
                        ? 'Clear selection'
                        : 'Select all'}
                    </Button>
                    <Button
                      type="submit"
                      disabled={follow.isPending || !selected.length || followed.isError}
                    >
                      {follow.isPending
                        ? 'Starting updates…'
                        : `Follow selected (${selected.length})`}
                    </Button>
                  </div>
                  <ul className="divide-y divide-border border-y border-border">
                    {discovery.data.map((playlist) => {
                      const saved = existing.get(playlist.youtubeId);
                      const following = !!saved?.enabled && !!saved.account;
                      const inputId = `select-${playlist.youtubeId}`;
                      return (
                        <li key={playlist.youtubeId} className="flex items-start gap-3 py-5">
                          <Checkbox
                            id={inputId}
                            className="mt-0.5"
                            disabled={following || follow.isPending || followed.isError}
                            checked={following || field.state.value.includes(playlist.youtubeId)}
                            onCheckedChange={(checked) =>
                              field.handleChange(
                                checked
                                  ? [...field.state.value, playlist.youtubeId]
                                  : field.state.value.filter(
                                      (value) => value !== playlist.youtubeId,
                                    ),
                              )
                            }
                          />
                          <div className="min-w-0 flex-1">
                            <label
                              htmlFor={inputId}
                              className="block break-words text-sm font-medium"
                            >
                              {playlist.title}
                            </label>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <a
                                href={playlist.url}
                                target="_blank"
                                rel="noreferrer"
                                className="hover:underline"
                              >
                                Open on YouTube
                              </a>
                              {saved && (
                                <Link
                                  to="/playlists/$id"
                                  params={{ id: saved.id }}
                                  search={{ q: '' }}
                                  className="hover:underline"
                                >
                                  {saved.enabled
                                    ? saved.account
                                      ? 'Following · View playlist'
                                      : 'Already following · Select to link account'
                                    : 'Paused · Select to resume'}
                                </Link>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              );
            }}
          </form.Field>
        </form>
      ) : (
        !discovery.error && (
          <p className="py-10 text-sm text-muted-foreground">
            No public playlists are visible on this account. You can refresh later or add another
            account.
          </p>
        )
      )}
    </section>
  );
}
