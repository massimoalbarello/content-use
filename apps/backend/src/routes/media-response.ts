import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
export function mediaResponse({ path, range }: { path: string; range: string | null }) {
  const file = Bun.file(path);
  const size = file.size;
  const headers = {
    'Content-Type': file.type || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (!size) {
    return new Response('Media not found', { status: 404 });
  }
  if (!range) {
    return new Response(file, { headers: { ...headers, 'Content-Length': String(size) } });
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  const unsatisfied = () =>
    new Response(null, {
      status: 416,
      headers: { ...headers, 'Content-Range': `bytes */${size}` },
    });
  if (!match || (!match[1] && !match[2])) {
    return unsatisfied();
  }
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start > end ||
    start >= size ||
    (!match[1] && Number(match[2]) === 0)
  ) {
    return unsatisfied();
  }
  return new Response(
    Readable.toWeb(createReadStream(path, { start, end })) as unknown as ReadableStream<Uint8Array>,
    {
      status: 206,
      headers: {
        ...headers,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`,
      },
    },
  );
}
