import { AudioLines } from 'lucide-react';
export function Brand() {
  return (
    <span className="inline-flex items-center gap-2.5 font-semibold tracking-tight text-lg">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <AudioLines size={20} strokeWidth={1.7} />
      </span>
      content use<span className="text-muted-foreground font-normal">.</span>
    </span>
  );
}
