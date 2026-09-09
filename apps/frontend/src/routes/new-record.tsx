import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { ErrorNotice } from '../components/layout/states';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { api, unwrap } from '../lib/api';
export function NewRecord() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const create = useMutation({
    mutationFn: async (value: { url: string }) => unwrap(await api.records.post(value)),
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: ['records'] });
      await navigate({ to: '/records/$id', params: { id } });
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
        search={{ q: '' }}
        className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} />
        All records
      </Link>
      <h1 className="mt-10 text-3xl font-medium tracking-tight">Add records</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Save a video or audio link to your library. Captions are queued automatically. Already saved
        links open the existing record.
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        To choose videos from a playlist,{' '}
        <Link
          to="/playlists/new"
          search={{ url: '' }}
          className="text-foreground underline underline-offset-4"
        >
          add a playlist
        </Link>
        .
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
                maxLength={4096}
                disabled={create.isPending}
                placeholder="https://www.youtube.com/watch?v=…"
                className="mt-2 h-11"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
              />
            </div>
          )}
        </form.Field>
        <ErrorNotice error={create.error} />
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Adding…' : 'Add record'}
        </Button>
      </form>
    </div>
  );
}
