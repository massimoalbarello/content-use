import { ArrowUpRight, AudioLines, FileText, Play } from 'lucide-react';
import { Button } from '../ui/button';
export function EmptyLibrary({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="flex flex-col items-center py-20 text-center">
      <div className="relative mb-9 flex h-32 w-52 items-center justify-center" aria-hidden="true">
        <div className="absolute left-2 top-6 -rotate-12 rounded-xl border border-border bg-background p-5 shadow-sm">
          <Play className="size-8 text-muted-foreground" strokeWidth={1} />
        </div>
        <div className="z-10 rounded-xl border border-border bg-background px-5 py-7 shadow-sm">
          <AudioLines className="size-10" strokeWidth={1} />
        </div>
        <div className="absolute right-2 top-6 rotate-12 rounded-xl border border-border bg-background p-5 shadow-sm">
          <FileText className="size-8 text-muted-foreground" strokeWidth={1} />
        </div>
      </div>
      <h2 className="text-xl font-medium tracking-tight">Good ideas deserve a record.</h2>
      <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
        Turn a video, podcast, or audio recording into a page you can watch, read, and make your
        own.
      </p>
      <Button className="mt-6 h-10 px-4" onClick={onCreate}>
        Create your first record
        <ArrowUpRight size={16} />
      </Button>
      <p className="mt-5 text-xs text-muted-foreground">
        One public URL. Media and transcript, together.
      </p>
    </section>
  );
}
