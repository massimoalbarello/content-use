import { AlertCircle, LoaderCircle } from 'lucide-react';
export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) {
    return null;
  }
  return (
    <div
      role="alert"
      className="my-4 flex items-start gap-2 rounded-lg bg-destructive/5 p-4 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 break-words">
        {error instanceof Error ? error.message : String(error)}
      </span>
    </div>
  );
}
export function Loading({ label = 'Loading your workspace…' }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex min-h-60 items-center justify-center gap-3 text-muted-foreground text-sm"
    >
      <LoaderCircle className="size-4 motion-safe:animate-spin" />
      {label}
    </div>
  );
}
