import { useEffect, useRef } from 'react';
import { ErrorNotice } from '../layout/states';
import { Button } from '../ui/button';

export function RecordLoadMore({
  hasMore,
  busy,
  loading,
  error,
  onLoadMore,
}: {
  hasMore: boolean;
  busy: boolean;
  loading: boolean;
  error: unknown;
  onLoadMore: () => void;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = sentinel.current;
    if (!element || !hasMore || busy || error || !('IntersectionObserver' in window)) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadMore();
        }
      },
      { rootMargin: '300px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMore, busy, error, onLoadMore]);

  if (!hasMore && !error) {
    return null;
  }
  return (
    <div ref={sentinel} className="mt-6 text-center">
      <ErrorNotice error={error} />
      <Button variant="ghost" disabled={busy} onClick={onLoadMore}>
        {loading ? 'Loading more records…' : error ? 'Try again' : 'Load more'}
      </Button>
      <span role="status" className="sr-only">
        {loading ? 'Loading more records…' : ''}
      </span>
    </div>
  );
}
