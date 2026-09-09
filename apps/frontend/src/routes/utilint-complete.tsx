import { useEffect } from 'react';
import { utilintCompleteRoute } from '../router';
export function UtilintComplete() {
  const { status, record } = utilintCompleteRoute.useSearch();
  useEffect(() => {
    if (window.opener) {
      window.opener.postMessage({ type: 'utilint:complete', status }, window.location.origin);
      window.close();
    }
  }, [status]);
  return (
    <main className="mx-auto max-w-lg p-10">
      <h1 className="text-2xl font-medium">
        {status === 'connected' ? 'utilint connected' : 'Connection not completed'}
      </h1>
      <p className="mt-4 text-sm text-muted-foreground">
        {status === 'connected'
          ? 'You can now generate summaries using your ChatGPT subscription.'
          : 'Start again from the summary button.'}
      </p>
      <a
        className="mt-6 inline-block underline"
        href={record ? `/records/${encodeURIComponent(record)}` : '/'}
      >
        Return to Content Use
      </a>
    </main>
  );
}
