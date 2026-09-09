import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mediaResponse } from '../../src/routes/media-response';

test('media supports bounded and suffix byte ranges and rejects invalid ranges', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'content-use-range-'));
  const path = join(folder, 'audio.mp3');
  try {
    await Bun.write(path, '0123456789');
    const part = mediaResponse({ path, range: 'bytes=2-5' });
    expect(part.status).toBe(206);
    expect(await part.text()).toBe('2345');
    expect(part.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(await mediaResponse({ path, range: 'bytes=-3' }).text()).toBe('789');
    for (const range of ['bytes=20-', 'bytes=8-2', 'bytes=-0', 'bytes=0-1,3-4', 'bytes=-']) {
      expect(mediaResponse({ path, range }).status).toBe(416);
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
