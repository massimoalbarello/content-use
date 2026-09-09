import type { RecordView } from '@repo/backend/record';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Copy,
  Download,
  FileText,
  Pencil,
  RotateCw,
} from 'lucide-react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ErrorNotice, Loading } from '../components/layout/states';
import { DeleteRecord } from '../components/records/delete-record';
import { PlaylistTags } from '../components/records/playlist-tags';
import { durationLabel, Status } from '../components/records/status';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { api, unwrap } from '../lib/api';
import { recordOptions } from '../lib/queries';
import { recordRoute } from '../router';
export function RecordPage() {
  const { id } = recordRoute.useParams();
  const record = useQuery(recordOptions(id));
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const remove = useMutation({
    mutationFn: async () => unwrap(await api.records({ id }).delete()),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['records'] });
      await navigate({ to: '/', search: { q: '', offset: 0 } });
    },
  });
  const retry = useMutation({
    mutationFn: async () => unwrap(await api.records({ id }).retry.post()),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['records'] });
    },
  });
  if (record.isPending) {
    return <Loading label="Loading record…" />;
  }
  return (
    <div className="mx-auto max-w-4xl px-6 py-10 sm:px-12 lg:py-14">
      <Link
        to="/"
        search={{ q: '', offset: 0 }}
        className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} />
        All records
      </Link>
      <ErrorNotice error={record.error || remove.error || retry.error} />
      {record.error && (
        <Button variant="outline" onClick={() => void record.refetch()}>
          Try again
        </Button>
      )}
      {record.data &&
        (editing ? (
          <RecordEditor record={record.data} onClose={() => setEditing(false)} />
        ) : (
          <>
            <div className="mt-9 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-[11px] uppercase tracking-widest text-muted-foreground">
                <FileText size={14} />
                Record
                <Status status={record.data.status} />
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  disabled={!['ready', 'failed'].includes(record.data.status)}
                  onClick={() => setEditing(true)}
                >
                  <Pencil size={14} />
                  Edit record
                </Button>
                <a
                  href={`/api/records/${id}/markdown`}
                  aria-label="Download Markdown"
                  title="Download Markdown"
                  className="p-2 rounded-lg hover:bg-muted"
                >
                  <Download size={15} />
                </a>
                <DeleteRecord pending={remove.isPending} onDelete={() => remove.mutate()} />
              </div>
            </div>
            <h1 className="mt-4 break-words text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
              {record.data.title}
            </h1>
            <RecordMetadata record={record.data} />
            <RecordMedia record={record.data} />
            {record.data.error && (
              <div className="mt-5">
                <ErrorNotice
                  error={
                    /confirm.*not a bot|sign in to confirm/i.test(record.data.error ?? '')
                      ? 'Captions couldn’t be retrieved. You can still play the video and try again.'
                      : record.data.error
                  }
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={retry.isPending}
                    onClick={() => retry.mutate()}
                  >
                    <RotateCw size={14} />
                    {retry.isPending ? 'Retrying…' : 'Retry processing'}
                  </Button>
                </div>
              </div>
            )}
            {!['ready', 'failed'].includes(record.data.status) && (
              <div
                role="status"
                className="mt-5 flex items-center gap-3 rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground"
              >
                <RotateCw className="size-4 motion-safe:animate-spin" />
                {record.data.progress}
              </div>
            )}
            <Transcript
              key={record.data.updatedAt}
              markdown={record.data.markdown}
              status={record.data.status}
            />
          </>
        ))}
    </div>
  );
}
function RecordMetadata({ record }: { record: RecordView }) {
  return (
    <div className="mt-4 mb-8 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      <a
        href={record.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {new URL(record.url).hostname.replace(/^www\./, '')}
        <ArrowUpRight size={12} />
      </a>
      <span>
        {record.mediaType === 'audio' ? 'Audio' : 'Video'}
        {record.duration !== null && ` · ${durationLabel(record.duration)}`}
      </span>
      <span>Added {new Date(record.createdAt).toLocaleDateString()}</span>
      <PlaylistTags playlists={record.playlists} />
    </div>
  );
}
function RecordMedia({ record }: { record: RecordView }) {
  if (!record.mediaUrl && record.embedUrl) {
    return (
      <div>
        <iframe
          src={record.embedUrl}
          title={record.title}
          className="aspect-video w-full rounded-xl bg-black"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
        <p className="mt-2 text-xs text-muted-foreground">Playing from YouTube</p>
      </div>
    );
  }
  if (!record.mediaUrl) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-xl bg-muted/70 p-6 text-center text-sm text-muted-foreground">
        {record.status === 'failed'
          ? 'Recording unavailable. You can open the original source above.'
          : 'Your recording will appear here when it’s ready.'}
      </div>
    );
  }
  return record.mediaType === 'audio' ? (
    <div className="rounded-xl bg-muted/50 px-5 py-8">
      <audio controls preload="metadata" src={record.mediaUrl} className="w-full">
        <track kind="captions" />
        Your browser does not support audio playback.
      </audio>
    </div>
  ) : (
    <video
      controls
      playsInline
      preload="metadata"
      src={record.mediaUrl}
      className="aspect-video w-full rounded-xl bg-black"
    >
      <track kind="captions" />
      Your browser does not support video playback.
    </video>
  );
}
function Transcript({ markdown, status }: { markdown: string; status: string }) {
  const copy = useMutation({ mutationFn: () => navigator.clipboard.writeText(markdown) });
  const words = markdown.trim() ? markdown.trim().split(/\s+/).length : 0;
  return (
    <section className="mt-10 border-t border-border pt-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium tracking-tight">Transcript</h2>
          {words > 0 && (
            <p className="mt-1 text-xs tabular-nums text-muted-foreground">
              {words.toLocaleString()} {words === 1 ? 'word' : 'words'}
            </p>
          )}
        </div>
        {markdown && (
          <Button variant="ghost" size="sm" disabled={copy.isPending} onClick={() => copy.mutate()}>
            {copy.isSuccess ? <Check size={13} /> : <Copy size={13} />}
            <span aria-live="polite">{copy.isSuccess ? 'Copied' : 'Copy text'}</span>
          </Button>
        )}
      </div>
      <ErrorNotice error={copy.error} />
      {markdown ? (
        <div className="markdown max-w-[70ch]">
          <ReactMarkdown
            skipHtml
            components={{
              img: () => null,
              a: ({ children, href }) => (
                <a href={href} target="_blank" rel="noreferrer">
                  {children}
                </a>
              ),
            }}
          >
            {markdown}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">
          {status === 'failed'
            ? 'Retry when the source is available, or add a transcript with Edit record.'
            : status === 'ready'
              ? 'This source has no captions. You can write a transcript with Edit record.'
              : 'Looking for captions from the original source…'}
        </p>
      )}
    </section>
  );
}
function RecordEditor({ record, onClose }: { record: RecordView; onClose: () => void }) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: async (value: { title: string; markdown: string }) =>
      unwrap(await api.records({ id: record.id }).patch(value)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['records'] });
      onClose();
    },
  });
  const form = useForm({
    defaultValues: { title: record.title, markdown: record.markdown },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(value).catch(() => {});
    },
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="sticky top-0 z-10 mt-9 mb-5 -mx-2 flex flex-wrap justify-between items-center gap-3 bg-background/95 px-2 py-3 backdrop-blur-sm">
        <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
          Edit record
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" disabled={save.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save record'}
          </Button>
        </div>
      </div>
      <form.Field name="title">
        {(field) => (
          <div>
            <label htmlFor="edit-title" className="text-sm font-medium">
              Title
            </label>
            <Input
              id="edit-title"
              required
              maxLength={300}
              className="mt-2 mb-7 h-12 text-lg"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </div>
        )}
      </form.Field>
      <RecordMedia record={record} />
      <form.Field name="markdown">
        {(field) => (
          <div className="mt-8">
            <label htmlFor="edit-transcript" className="text-sm font-medium">
              Transcript · Markdown
            </label>
            <Textarea
              id="edit-transcript"
              className="mt-3 min-h-96 font-mono text-sm leading-7"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </div>
        )}
      </form.Field>
      <ErrorNotice error={save.error} />
    </form>
  );
}
