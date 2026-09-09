import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { ErrorNotice } from '../components/layout/states';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { api, unwrap } from '../lib/api';

export function NewAccount() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const create = useMutation({
    mutationFn: async (value: { url: string }) => unwrap(await api.accounts.post(value)),
    onSuccess: async ({ id }) => {
      await client.invalidateQueries({ queryKey: ['accounts'] });
      await navigate({ to: '/accounts/$id', params: { id } });
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
        to="/accounts"
        className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} /> All accounts
      </Link>
      <h1 className="mt-10 text-3xl font-medium tracking-tight">Add account</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Find an account’s public playlists, then choose which ones to import. No YouTube sign-in is
        needed.
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
              <label htmlFor="account-url" className="text-sm font-medium">
                YouTube handle or channel URL
              </label>
              <Input
                id="account-url"
                autoFocus
                required
                maxLength={4096}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="@massimoalbarello3055"
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
          {create.isPending ? 'Finding account…' : 'Find playlists'}
        </Button>
      </form>
    </div>
  );
}
