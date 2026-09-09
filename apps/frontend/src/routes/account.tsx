import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ArrowUpRight, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ErrorNotice } from '../components/layout/states';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../components/ui/alert-dialog';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { api, unwrap } from '../lib/api';
import { accountOptions } from '../lib/queries';
import { accountRoute } from '../router';
import { AccountPlaylists } from './account-playlists';

export function AccountPage() {
  const { id } = accountRoute.useParams();
  const query = useQuery(accountOptions(id));
  return (
    <div className="mx-auto max-w-6xl px-6 py-10 sm:px-12 lg:py-14">
      <Link
        to="/accounts"
        className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} /> All accounts
      </Link>
      <ErrorNotice error={query.error} />
      {query.error && (
        <Button variant="outline" onClick={() => void query.refetch()}>
          Try again
        </Button>
      )}
      {query.isPending && (
        <p role="status" className="py-12 text-sm text-muted-foreground">
          Loading account…
        </p>
      )}
      {query.data && (
        <>
          <AccountDetails key={id} account={query.data} />
          <AccountPlaylists key={id} id={id} />
        </>
      )}
    </div>
  );
}

function AccountDetails({ account }: { account: { id: string; title: string; url: string } }) {
  const [editing, setEditing] = useState(false);
  const client = useQueryClient();
  const navigate = useNavigate();
  const edit = useMutation({
    mutationFn: async (value: { title: string }) =>
      unwrap(await api.accounts({ id: account.id }).patch(value)),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['accounts', account.id], exact: true });
      await client.invalidateQueries({ queryKey: ['accounts'], exact: true });
      await client.invalidateQueries({ queryKey: ['playlists'] });
      setEditing(false);
    },
  });
  const remove = useMutation({
    mutationFn: async () => unwrap(await api.accounts({ id: account.id }).delete()),
    onSuccess: async () => {
      await client.cancelQueries({ queryKey: ['accounts', account.id] });
      client.removeQueries({ queryKey: ['accounts', account.id] });
      await client.invalidateQueries({ queryKey: ['accounts'], exact: true });
      await client.invalidateQueries({ queryKey: ['playlists'] });
      await navigate({ to: '/accounts' });
    },
  });
  const form = useForm({
    defaultValues: { title: account.title },
    onSubmit: async ({ value }) => {
      await edit.mutateAsync(value).catch(() => {});
    },
  });
  return (
    <div className="mt-6">
      <ErrorNotice error={edit.error ?? remove.error} />
      {editing ? (
        <form
          className="max-w-lg space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="title">
            {(field) => (
              <div>
                <label htmlFor="account-name" className="text-sm font-medium">
                  Account name
                </label>
                <Input
                  id="account-name"
                  autoFocus
                  required
                  maxLength={300}
                  className="mt-2"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                />
              </div>
            )}
          </form.Field>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={edit.isPending}
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={edit.isPending}>
              {edit.isPending ? 'Saving…' : 'Save account'}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="min-w-0 basis-full break-words text-3xl font-medium tracking-tight sm:flex-1 sm:basis-auto">
            {account.title}
          </h1>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={remove.isPending}
              onClick={() => {
                form.reset({ title: account.title });
                edit.reset();
                setEditing(true);
              }}
            >
              <Pencil size={14} /> Edit account
            </Button>
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button variant="ghost" aria-label="Delete account" disabled={remove.isPending}>
                    <Trash2 size={15} />
                  </Button>
                }
              />
              <AlertDialogContent>
                <AlertDialogTitle>Delete this account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the saved account and its links to playlists. Your playlists, hourly
                  updates, and records stay available. You can add the account again later.
                </AlertDialogDescription>
                <AlertDialogFooter>
                  <AlertDialogClose render={<Button variant="outline">Cancel</Button>} />
                  <AlertDialogClose
                    render={
                      <Button variant="destructive" onClick={() => remove.mutate()}>
                        Delete account
                      </Button>
                    }
                  />
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}
      <a
        href={account.url}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        Open on YouTube <ArrowUpRight size={12} />
      </a>
    </div>
  );
}
