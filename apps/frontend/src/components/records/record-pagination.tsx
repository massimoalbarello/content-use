import { Button } from '../ui/button';
export function RecordPagination({
  total,
  offset,
  pending,
  onChange,
}: {
  total?: number;
  offset: number;
  pending: boolean;
  onChange: (offset: number) => void;
}) {
  if (total === undefined || (total <= 50 && offset === 0)) {
    return null;
  }
  return (
    <div className="mt-6 flex items-center justify-between gap-3">
      <Button
        variant="ghost"
        disabled={!offset || pending}
        onClick={() => onChange(Math.max(0, offset - 50))}
      >
        Previous
      </Button>
      <span className="text-xs tabular-nums text-muted-foreground">
        {Math.min(offset + 1, total)}–{Math.min(offset + 50, total)} of {total.toLocaleString()}
      </span>
      <Button
        variant="ghost"
        disabled={offset + 50 >= total || pending}
        onClick={() => onChange(offset + 50)}
      >
        Next
      </Button>
    </div>
  );
}
