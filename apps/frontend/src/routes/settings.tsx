import { useMutation } from '@tanstack/react-query';
import { Fingerprint } from 'lucide-react';
import { ErrorNotice } from '../components/layout/states';
import { Button } from '../components/ui/button';
import { UtilintSettings } from '../components/utilint-settings';
import { authClient } from '../lib/auth';

export function Settings() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10 sm:px-12 lg:py-14">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Workspace</p>
      <h1 className="mt-4 text-3xl font-medium tracking-tight">Settings</h1>
      <PasskeySettings />
      <UtilintSettings />
    </div>
  );
}
function PasskeySettings() {
  const add = useMutation({
    mutationFn: async () => {
      const result = await authClient.passkey.addPasskey({ name: 'Additional passkey' });
      if (result.error) {
        throw new Error(result.error.message ?? 'Could not add a passkey.');
      }
    },
  });
  return (
    <section className="mt-12 border-t border-border pt-8">
      <div className="flex items-center gap-3">
        <Fingerprint size={20} strokeWidth={1.5} />
        <h2 className="font-medium">Passkeys</h2>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Add a passkey on another device or security key so you always have a way back into your
        workspace.
      </p>
      <Button
        className="mt-5 h-10 px-4"
        variant="outline"
        disabled={add.isPending}
        onClick={() => add.mutate()}
      >
        {add.isPending ? 'Waiting for passkey…' : 'Add a passkey'}
      </Button>
      <ErrorNotice error={add.error} />
      {add.isSuccess && (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          Passkey added.
        </p>
      )}
    </section>
  );
}
