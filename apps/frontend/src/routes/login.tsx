import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, AudioLines, Fingerprint, LockKeyhole } from 'lucide-react';
import { Brand } from '../components/layout/brand';
import { ErrorNotice } from '../components/layout/states';
import { Button } from '../components/ui/button';
import { authClient } from '../lib/auth';
import { ownerOptions } from '../lib/queries';
export function Login() {
  const owner = useQuery(ownerOptions);
  const client = useQueryClient();
  const authenticate = useMutation({
    mutationFn: async () => {
      const result = owner.data?.ownerRegistered
        ? await authClient.signIn.passkey()
        : await authClient.passkey.addPasskey({ createSession: true, name: 'Primary passkey' });
      if (result.error) {
        throw new Error(
          result.error.message ?? 'Passkey request was cancelled. Try again when ready.',
        );
      }
    },
    onSuccess: async () => {
      await client.invalidateQueries();
    },
  });
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-7 py-7 sm:px-12">
        <Brand />
        <span className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
          <LockKeyhole size={13} />
          Your private media library
        </span>
      </header>
      <main className="mx-auto grid min-h-[75vh] max-w-6xl items-center gap-16 px-7 py-16 lg:grid-cols-2 lg:gap-24">
        <section>
          <p className="mb-6 text-xs uppercase tracking-[0.22em] text-muted-foreground">
            Watch. Listen. Keep the words.
          </p>
          <h1 className="max-w-lg text-5xl font-medium leading-[1.12] tracking-[-0.045em] sm:text-6xl">
            Your media.
            <br />
            <span className="text-muted-foreground">In your words.</span>
          </h1>
          <p className="mt-7 max-w-md text-base leading-7 text-muted-foreground">
            A quiet home for the things you want to remember. Save a public audio or video URL and
            turn it into an editable, searchable record.
          </p>
          <div className="mt-10 max-w-sm">
            <Button
              className="h-12 w-full justify-between px-5"
              disabled={authenticate.isPending || !owner.data}
              onClick={() => authenticate.mutate()}
            >
              <span className="flex items-center gap-3">
                <Fingerprint size={20} />
                {authenticate.isPending
                  ? 'Waiting for your passkey…'
                  : owner.data?.ownerRegistered
                    ? 'Sign in with passkey'
                    : 'Create your passkey'}
              </span>
              <ArrowRight size={16} />
            </Button>
            <ErrorNotice error={authenticate.error || owner.error} />
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              {owner.data?.ownerRegistered
                ? 'Use the passkey you registered for this workspace.'
                : 'Your passkey makes this workspace yours. No password needed.'}
            </p>
          </div>
        </section>
        <section
          aria-label="How a record works"
          className="relative rounded-2xl bg-muted/40 p-6 sm:p-10"
        >
          <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
              <span className="size-1.5 rounded-full bg-foreground" />A record, from start to finish
            </div>
            <div className="my-7 flex h-32 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <AudioLines className="size-20" strokeWidth={0.7} />
            </div>
            <h2 className="text-lg font-medium tracking-tight">The original, and every word.</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Play the recording. Read the captions.
              <br />
              Edit, search, and take it with you as Markdown.
            </p>
            <div className="mt-7 space-y-2.5" aria-hidden="true">
              {[100, 91, 96, 64].map((width) => (
                <div
                  key={width}
                  className="h-1.5 rounded-full bg-muted"
                  style={{ width: `${width}%` }}
                />
              ))}
            </div>
            <div className="mt-8 flex items-center justify-between border-t border-border pt-4 text-[11px] text-muted-foreground">
              <span>01 — Source</span>
              <span>02 — Captions</span>
              <span>03 — Yours</span>
            </div>
          </div>
        </section>
      </main>
      <footer className="px-7 py-7 text-xs text-muted-foreground sm:px-12">
        Content Use · A little less lost in the feed.
      </footer>
    </div>
  );
}
