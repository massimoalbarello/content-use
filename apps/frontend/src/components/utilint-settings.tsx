import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { connectUtilint, disconnectUtilint, utilintOptions } from '../lib/utilint';
import { ErrorNotice } from './layout/states';
import { Button } from './ui/button';
export function UtilintSettings() {
  const qc = useQueryClient();
  const connection = useQuery(utilintOptions);
  const connect = useMutation({
    mutationFn: () => connectUtilint(),
    onSuccess: () => qc.invalidateQueries(utilintOptions),
  });
  const disconnect = useMutation({
    mutationFn: disconnectUtilint,
    onSuccess: () => qc.invalidateQueries(utilintOptions),
  });
  return (
    <section className="mt-12 border-t border-border pt-8">
      <h2 className="font-medium">utilint</h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Use your ChatGPT subscription to summarize transcripts.
      </p>
      <ErrorNotice error={connection.error || connect.error || disconnect.error} />
      {connection.data && (
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
    </section>
  );
}
