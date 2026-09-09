import type { RecordStatus } from '@repo/backend/record';
export function Status({
  status,
  hasTranscript,
}: {
  status: RecordStatus;
  hasTranscript: boolean;
}) {
  const label = {
    queued: 'Queued',
    downloading: 'Processing',
    transcribing: 'Processing',
    ready: hasTranscript ? 'Ready' : 'No captions',
    failed: 'Needs attention',
  }[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs whitespace-nowrap ${status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}
    >
      <span
        className={`size-1.5 rounded-full ${status === 'ready' ? 'bg-foreground' : status === 'failed' ? 'bg-destructive' : 'bg-muted-foreground motion-safe:animate-pulse'}`}
      />
      {label}
    </span>
  );
}
export function durationLabel(seconds: number | null) {
  if (seconds === null) {
    return '—';
  }
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`;
}
