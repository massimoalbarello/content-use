import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  configureUtilint,
  connectUtilint,
  disconnectUtilint,
  utilintOptions,
} from '../lib/utilint';
import { ErrorNotice } from './layout/states';
import { Button } from './ui/button';
import { Input } from './ui/input';
export function UtilintSettings() {
  const qc = useQueryClient();
  const connection = useQuery(utilintOptions);
  const save = useMutation({
    mutationFn: configureUtilint,
    onSuccess: () => {
      form.setFieldValue('clientSecret', '');
      return qc.invalidateQueries(utilintOptions);
    },
  });
  const connect = useMutation({
    mutationFn: () => connectUtilint(),
    onSuccess: () => qc.invalidateQueries(utilintOptions),
  });
  const disconnect = useMutation({
    mutationFn: disconnectUtilint,
    onSuccess: () => qc.invalidateQueries(utilintOptions),
  });
  const form = useForm({
    defaultValues: { origin: 'https://utilint-crrxrd.nibrun.app', clientId: '', clientSecret: '' },
    onSubmit: ({ value }) => save.mutate(value),
  });
  return (
    <section className="mt-12 border-t border-border pt-8">
      <h2 className="font-medium">utilint</h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Use your ChatGPT subscription to summarize transcripts.
      </p>
      <ErrorNotice error={connection.error || save.error || connect.error || disconnect.error} />
      {connection.data?.configured && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span className="text-sm">
            {connection.data.connected ? 'Connected' : 'Ready to connect'}
          </span>
          <Button
            variant="outline"
            disabled={connect.isPending || disconnect.isPending}
            onClick={() => (connection.data.connected ? disconnect.mutate() : connect.mutate())}
          >
            {connection.data.connected ? 'Disconnect utilint' : 'Connect utilint'}
          </Button>
          {connection.data.connected && (
            <a
              className="text-xs underline"
              href={`${connection.data.origin}/dashboard`}
              target="_blank"
              rel="noreferrer"
            >
              Manage app access
            </a>
          )}
        </div>
      )}
      {connection.data && !connection.data.connected && (
        <details className="mt-6" open={!connection.data.configured}>
          <summary className="cursor-pointer text-sm font-medium">Developer setup</summary>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Register Content Use in your utilint developer dashboard, then paste the client ID and
            secret below. Register these URLs:
          </p>
          <p className="mt-4 text-sm">Connection start URL</p>
          <code className="mt-2 block break-all rounded-lg bg-muted p-3 text-xs">
            {connection.data.startUrl}
          </code>
          <p className="mt-4 text-sm">Redirect URL</p>
          <code className="mt-2 block break-all rounded-lg bg-muted p-3 text-xs">
            {connection.data.callback}
          </code>
          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            {(['origin', 'clientId', 'clientSecret'] as const).map((name) => (
              <form.Field name={name} key={name}>
                {(field) => (
                  <div>
                    <label className="text-sm" htmlFor={`utilint-${name}`}>
                      {name === 'origin'
                        ? 'utilint URL'
                        : name === 'clientId'
                          ? 'Client ID'
                          : 'Client secret'}
                    </label>
                    <Input
                      className="mt-2"
                      id={`utilint-${name}`}
                      type={name === 'clientSecret' ? 'password' : 'text'}
                      required
                      autoComplete="off"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                    />
                  </div>
                )}
              </form.Field>
            ))}
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save utilint app'}
            </Button>
            {save.isSuccess && (
              <p role="status" className="text-sm">
                App saved. Connect utilint to authorize access.
              </p>
            )}
          </form>
        </details>
      )}
    </section>
  );
}
