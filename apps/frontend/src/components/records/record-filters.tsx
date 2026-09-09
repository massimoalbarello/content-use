import { RECORD_FILTERS, type RecordFilter } from '@repo/backend/record';

const labels: Record<RecordFilter, string> = {
  all: 'All',
  ready: 'Completed',
  processing: 'Processing',
  queued: 'Queued',
  failed: 'Failed',
};
export function RecordFilters({
  value,
  onChange,
}: {
  value: RecordFilter;
  onChange: (value: RecordFilter) => void;
}) {
  return (
    <fieldset aria-label="Filter records by status" className="mb-6 flex flex-wrap gap-1">
      {RECORD_FILTERS.map((status) => (
        <button
          key={status}
          type="button"
          aria-pressed={value === status}
          onClick={() => onChange(status)}
          className={`rounded-lg px-2.5 py-2 text-xs transition-colors ${value === status ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`}
        >
          {labels[status]}
        </button>
      ))}
    </fieldset>
  );
}
