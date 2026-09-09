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
  const color = {
    queued: 'text-muted-foreground',
    downloading: 'text-muted-foreground',
    transcribing: 'text-muted-foreground',
    ready: hasTranscript
      ? 'text-green-700 dark:text-green-400'
      : 'text-yellow-700 dark:text-yellow-400',
    failed: 'text-orange-700 dark:text-orange-400',
  }[status];
  const processing = status === 'queued' || status === 'downloading' || status === 'transcribing';
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs whitespace-nowrap ${color}`}>
      <span
        className={`size-1.5 rounded-full bg-current ${processing ? 'motion-safe:animate-pulse' : ''}`}
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
