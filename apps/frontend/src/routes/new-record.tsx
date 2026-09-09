import { playlistUrl } from '@repo/backend/playlist';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, Link2 } from 'lucide-react';
import { ErrorNotice } from '../components/layout/states';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { api, unwrap } from '../lib/api';
export function NewRecord() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const create = useMutation({
    mutationFn: async (value: { url: string }) =>
      playlistUrl(value.url)
        ? { kind: 'playlist' as const, ...unwrap(await api.playlists.post(value)) }
        : { kind: 'record' as const, ...unwrap(await api.records.post(value)) },
    onSuccess: async (record) => {
      await queryClient.invalidateQueries({ queryKey: ['records'] });
      await queryClient.invalidateQueries({ queryKey: ['playlists'] });
      if (record.kind === 'playlist') {
        await navigate({
          to: '/playlists/$id',
          params: { id: record.id },
          search: { q: '', offset: 0 },
        });
      } else {
        await navigate({ to: '/records/$id', params: { id: record.id } });
      }
    },
  });
  const form = useForm({
    defaultValues: { url: '' },
    onSubmit: async ({ value }) => {
      await create.mutateAsync(value).catch(() => {});
    },
  });
  return (
    <div className="mx-auto max-w-3xl px-6 py-10 sm:px-12 lg:py-14">
      <Link
        to="/"
        search={{ q: '', offset: 0 }}
        className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} />
        All records
      </Link>
      <div className="mt-12 mb-7 flex size-12 items-center justify-center rounded-xl bg-muted">
        <Link2 strokeWidth={1.5} />
      </div>
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        Add to your library
      </p>
      <h1 className="mt-3 text-3xl font-medium tracking-tight">Start with a link.</h1>
      <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
        Save a video, audio link, or public YouTube playlist with its captions.
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
              <label htmlFor="source-url" className="text-sm font-medium">
                Source URL
              </label>
              <Input
                autoFocus
                id="source-url"
                name="url"
                type="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                placeholder="https://www.youtube.com/watch?v=…"
                className="mt-2 h-11"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Playlists import each video and check for new additions every hour.
              </p>
            </div>
          )}
        </form.Field>
        <ErrorNotice error={create.error} />
        <div className="border-t border-border pt-6 flex flex-wrap justify-between items-center gap-4">
          <p className="text-xs text-muted-foreground">
            Captions are queued automatically, including when the service is busy.
          </p>
          <Button type="submit" className="h-10 px-4" disabled={create.isPending}>
            {create.isPending ? 'Adding…' : 'Get captions'}
            <ArrowRight size={16} />
          </Button>
        </div>
      </form>
    </div>
  );
}
