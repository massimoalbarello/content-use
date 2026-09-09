import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Check, Sparkles } from 'lucide-react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { connectUtilint, generateSummary, summaryOptions, utilintOptions } from '../../lib/utilint';
import { ErrorNotice } from '../layout/states';
import { Button } from '../ui/button';
export function RecordSummary({
  id,
  hasTranscript,
  transcriptVersion,
}: {
  id: string;
  hasTranscript: boolean;
  transcriptVersion: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const qc = useQueryClient();
  const connection = useQuery(utilintOptions);
  const options = summaryOptions(id, transcriptVersion);
  const summary = useQuery({ ...options, enabled: hasTranscript });
  const summarized = Boolean(summary.data?.summary);
  const generate = useMutation({
    mutationFn: async () => {
      if (!connection.data?.connected) {
        if (!(await connectUtilint(id))) {
          return null;
        }
        await qc.invalidateQueries(utilintOptions);
      }
      return generateSummary(id);
    },
    onSuccess: (result) => {
      if (result) {
        qc.setQueryData(options.queryKey, result);
      }
    },
    onSettled: () => qc.invalidateQueries(utilintOptions),
  });
  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          className={
            summarized ? 'border-emerald-200 text-emerald-700 disabled:opacity-100' : undefined
          }
          disabled={
            summarized ||
            summary.isPending ||
            !hasTranscript ||
            generate.isPending ||
            connection.isPending ||
            connection.isError ||
            !connection.data?.configured
          }
          onClick={() => {
            setExpanded(true);
            generate.mutate();
          }}
        >
          {summarized ? <Check size={14} aria-hidden="true" /> : <Sparkles size={14} />}
          {summarized ? 'Summarized' : generate.isPending ? 'Summarizing…' : 'Summarize'}
        </Button>
        {summarized && (
          <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Hide summary' : 'View summary'}
          </Button>
        )}
        {connection.data && !connection.data.configured && (
          <Link className="text-xs underline" to="/settings">
            Set up utilint
          </Link>
        )}
      </div>
      {expanded && (
        <div className="mt-4 rounded-xl border border-border p-5">
          <h2 className="text-sm font-medium">Summary</h2>
          <p className="mt-1 mb-4 text-xs text-muted-foreground">
            Your ChatGPT subscription · utilint
          </p>
          <ErrorNotice error={generate.error || summary.error} />
          {generate.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              Preparing your summary…
            </p>
          ) : summary.data?.summary ? (
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
                {summary.data.summary.text}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No summary yet. Click Summarize to create one.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
