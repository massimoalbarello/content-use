import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MediaPipeline } from '../apps/backend/src/lib/media/pipeline';
import type { ContentRecord } from '../apps/backend/src/models/records';

const folder = await mkdtemp(join(tmpdir(), 'content-use-media-'));
const pipeline = new MediaPipeline(folder);
const record: ContentRecord = {
  id: 'rec-test',
  ownerId: 'test',
  title: 'JFK sample',
  url: 'https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/samples/jfk.wav',
  markdown: '',
  status: 'queued',
  progress: '',
  error: null,
  mediaName: null,
  mediaType: null,
  duration: null,
  createdAt: '',
  updatedAt: '',
};
try {
  await pipeline.prepare();
  const signal = AbortSignal.timeout(120000);
  const media = await pipeline.download({ record, signal });
  assert.equal(media.type, 'audio');
  assert.ok(Bun.file(pipeline.mediaPath({ ...record, name: media.name })).size > 1000);
  const captions = await pipeline.captions({ record, signal });
  assert.equal(captions.markdown, '');
  console.log('PASS real yt-dlp download and no-captions detection');
} finally {
  await rm(folder, { recursive: true, force: true });
}
