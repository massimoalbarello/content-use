import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { connectUtilint, generateSummary, summaryOptions, utilintOptions } from '../../lib/utilint';
import { ErrorNotice } from '../layout/states';
import { Button } from '../ui/button';
export function RecordSummary({ id, hasTranscript }: { id: string; hasTranscript: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const qc = useQueryClient();
  const connection = useQuery(utilintOptions);
  const summary = useQuery({ ...summaryOptions(id), enabled: expanded });
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
        qc.setQueryData(summaryOptions(id).queryKey, result);
      }
    },
    onSettled: () => qc.invalidateQueries(utilintOptions),
  });
  return (
    <section className="col-span-full min-w-0">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={
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
          <Sparkles size={14} />
          {generate.isPending ? 'Preparing summary…' : 'Summarize'}
        </Button>
        {hasTranscript && (
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
            Powered by your ChatGPT subscription through utilint.
          </p>
          <ErrorNotice error={generate.error || summary.error} />
          {generate.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              {connection.data?.connected
                ? 'Generating your summary…'
                : 'Finish connecting in the utilint window. Your summary will start automatically.'}
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
