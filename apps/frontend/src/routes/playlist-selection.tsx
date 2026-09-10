import type { PlaylistVideo } from '@repo/backend/playlist';
import { useForm } from '@tanstack/react-form';
import { ErrorNotice } from '../components/layout/states';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';

export function PlaylistSelection({
  playlist,
  pending,
  error,
  onAdd,
}: {
  playlist: { url: string; title: string; videos: PlaylistVideo[] };
  pending: boolean;
  error: Error | null;
  onAdd: (videoIds: string[]) => Promise<void>;
}) {
  const form = useForm({
    defaultValues: { selected: playlist.videos.map((video) => video.id) },
    onSubmit: async ({ value }) => {
      await onAdd(value.selected);
    },
  });
  return (
    <section className="mt-10" aria-label="Available videos">
      <h2 className="break-words text-lg font-medium">{playlist.title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {playlist.videos.length} available videos. Uncheck any you want to exclude. Excluded videos
        stay excluded from hourly updates; new additions are imported automatically.
      </p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Already saved videos reuse the existing record and keep the first playlist shown on it.
      </p>
      {!playlist.videos.length ? (
        <p className="py-8 text-sm text-muted-foreground">
          No available videos were found. Try another public playlist or find videos again later.
        </p>
      ) : (
        <form
          className="mt-6"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <ErrorNotice error={error} />
          <form.Field name="selected">
            {(field) => {
              const selected = new Set(field.state.value);
              return (
                <>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={pending || selected.size === playlist.videos.length}
                        onClick={() => field.handleChange(playlist.videos.map((video) => video.id))}
                      >
                        Select all
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={pending || !selected.size}
                        onClick={() => field.handleChange([])}
                      >
                        Clear selection
                      </Button>
                    </div>
                    <Button type="submit" disabled={pending || !selected.size}>
                      {pending ? 'Adding playlist…' : `Add selected (${selected.size})`}
                    </Button>
                  </div>
                  <p role="status" className="mb-3 text-xs text-muted-foreground">
                    {selected.size} of {playlist.videos.length} selected
                  </p>
                  <ul className="divide-y divide-border border-y border-border">
                    {playlist.videos.map((video) => (
                      <li key={video.id} className="flex items-start gap-3 py-5">
                        <Checkbox
                          id={`video-${video.id}`}
                          className="mt-0.5"
                          checked={selected.has(video.id)}
                          disabled={pending}
                          onCheckedChange={(checked) =>
                            field.handleChange(
                              checked
                                ? [...field.state.value, video.id]
                                : field.state.value.filter((id) => id !== video.id),
                            )
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <label
                            htmlFor={`video-${video.id}`}
                            className="block break-words text-sm font-medium"
                          >
                            {video.title}
                          </label>
                          <a
                            href={`https://www.youtube.com/watch?v=${video.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-block text-xs text-muted-foreground hover:underline"
                          >
                            Open on YouTube
                          </a>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              );
            }}
          </form.Field>
        </form>
      )}
    </section>
  );
}
