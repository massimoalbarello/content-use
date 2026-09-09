import { expect, test } from 'bun:test';
import { CaptionServiceError, HostedCaptions } from '../../../src/lib/media/hosted-captions';

const url = 'https://www.youtube.com/watch?v=rY0wnfFHYbs';
const transcript = {
  title: 'A real video',
  language: 'en',
  transcript: [{ text: 'Source captions.', start: 0, duration: 1 }],
};
test('anonymous retrieval sends only the video ID to the documented caption endpoint', async () => {
  const client = new HostedCaptions(undefined, (target, init) => {
    expect(target.origin).toBe('https://api.freetranscriptapi.com');
    expect(target.pathname).toBe('/v1/transcript');
    expect(target.searchParams.get('video_url')).toBe('rY0wnfFHYbs');
    expect(target.searchParams.size).toBe(1);
    expect(new Headers(init.headers).has('Authorization')).toBe(false);
    expect(init.redirect).toBe('error');
    return Promise.resolve(Response.json(transcript));
  });
  expect(
    await client.fetch('https://youtu.be/rY0wnfFHYbs?si=tracking', AbortSignal.timeout(5000)),
  ).toEqual({ title: 'A real video', markdown: 'Source captions.', duration: null });
  await expect(
    client.fetch('https://example.com/private.mp3', AbortSignal.timeout(5000)),
  ).rejects.toThrow('only accepts YouTube');
});
test('optional deployment key stays in the authorization header and out of URLs and errors', async () => {
  const client = new HostedCaptions('secret-test-key', (target, init) => {
    expect(target.href).not.toContain('secret-test-key');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer secret-test-key');
    return Promise.resolve(
      Response.json({ error: { message: 'secret-test-key' } }, { status: 401 }),
    );
  });
  await expect(client.fetch(url, AbortSignal.timeout(5000))).rejects.toThrow(
    'credential is invalid',
  );
});
test('only the documented no-transcript response completes without captions', async () => {
  const missing = new HostedCaptions(undefined, () =>
    Promise.resolve(Response.json({ error: { code: 'video_not_found' } }, { status: 404 })),
  );
  expect(await missing.fetch(url, AbortSignal.timeout(5000))).toEqual({
    title: url,
    markdown: '',
    duration: null,
  });
  const empty = new HostedCaptions(undefined, () =>
    Promise.resolve(Response.json({ title: 'Instrumental', transcript: [] })),
  );
  expect((await empty.fetch(url, AbortSignal.timeout(5000))).markdown).toBe('');
  for (const [status, code, permanent] of [
    [429, 'rate_limit_exceeded', false],
    [500, 'internal_error', false],
    [503, 'service_unavailable', false],
    [408, 'timeout', false],
    [401, 'unauthorized', true],
    [404, 'unknown_endpoint', true],
  ] as const) {
    const client = new HostedCaptions(undefined, () =>
      Promise.resolve(Response.json({ error: { code } }, { status })),
    );
    const error = await client.fetch(url, AbortSignal.timeout(5000)).catch((error) => error);
    expect(error).toBeInstanceOf(CaptionServiceError);
    expect(error.permanent).toBe(permanent);
    if (status === 429) {
      expect(error.retryAt).toBeGreaterThan(Date.now());
    }
  }
  const malformed = new HostedCaptions(undefined, () =>
    Promise.resolve(Response.json({ title: 'Video', transcript: [{ text: 'missing timing' }] })),
  );
  await expect(malformed.fetch(url, AbortSignal.timeout(5000))).rejects.toThrow(
    'Invalid caption segment',
  );
});
test('caps response size and propagates cancellation to network requests', async () => {
  const huge = new HostedCaptions(undefined, () =>
    Promise.resolve(new Response('x'.repeat(2000001))),
  );
  await expect(huge.fetch(url, AbortSignal.timeout(5000))).rejects.toThrow('2 MB');
  const controller = new AbortController();
  controller.abort(new Error('Record deleted'));
  const client = new HostedCaptions(undefined, (_target, init) =>
    Promise.reject(init.signal?.reason),
  );
  await expect(client.fetch(url, controller.signal)).rejects.toThrow('Record deleted');
});

test('videos without captions get the source title without sending caption credentials to YouTube', async () => {
  const client = new HostedCaptions('caption-secret', (target, init) => {
    if (target.origin === 'https://api.freetranscriptapi.com') {
      return Promise.resolve(
        Response.json({ error: { code: 'video_not_found' } }, { status: 404 }),
      );
    }
    expect(target.origin).toBe('https://www.youtube.com');
    expect(target.pathname).toBe('/oembed');
    expect(target.searchParams.get('url')).toBe(url);
    expect(new Headers(init.headers).has('Authorization')).toBe(false);
    return Promise.resolve(Response.json({ title: 'Source music title' }));
  });
  expect(await client.fetch(url, AbortSignal.timeout(5000))).toEqual({
    title: 'Source music title',
    markdown: '',
    duration: null,
  });
});

test('a title lookup failure does not turn missing captions back into a failure', async () => {
  const client = new HostedCaptions(undefined, (target) => {
    if (target.origin === 'https://api.freetranscriptapi.com') {
      return Promise.resolve(
        Response.json({ error: { code: 'video_not_found' } }, { status: 404 }),
      );
    }
    return Promise.reject(new Error('YouTube unavailable'));
  });
  expect(await client.fetch(url, AbortSignal.timeout(5000))).toEqual({
    title: url,
    markdown: '',
    duration: null,
  });
});
