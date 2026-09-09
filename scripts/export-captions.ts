import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MediaPipeline } from '../apps/backend/src/lib/media/pipeline';
import { validatePublicUrl } from '../apps/backend/src/lib/media/public-url';
import type { ContentRecord } from '../apps/backend/src/models/records';

const source = process.argv[2];
if (!source) {
  throw new Error('Usage: bun scripts/export-captions.ts PUBLIC_URL [output.record.json]');
}
const url = await validatePublicUrl(source);
const folder = await mkdtemp(join(tmpdir(), 'content-use-captions-'));
try {
  const pipeline = new MediaPipeline(folder);
  const record: ContentRecord = {
    id: 'export',
    ownerId: 'local',
    url,
    title: url,
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
  const result = await pipeline.captions({ record, signal: AbortSignal.timeout(180000) });
  if (!result.markdown) {
    throw new Error('This source has no published captions.');
  }
  const captionFolder = pipeline.folder(record);
  const filename = (await readdir(captionFolder)).find((name) =>
    /^captions\..+\.(json3|vtt|srt)$/.test(name),
  );
  if (!filename) {
    throw new Error('No caption file was produced.');
  }
  const content = await Bun.file(join(captionFolder, filename)).text();
  const format = filename.split('.').at(-1);
  const output = resolve(process.argv[3] ?? 'captions.record.json');
  if (await Bun.file(output).exists()) {
    throw new Error(`Output already exists: ${output}`);
  }
  await Bun.write(
    output,
    JSON.stringify({
      sourceUrl: url,
      title: result.title,
      ...(result.duration === null ? {} : { duration: result.duration }),
      format,
      content,
    }),
  );
  console.log(
    `Captions saved to ${output}. Import this file in the record’s Import captions section.`,
  );
} finally {
  await rm(folder, { recursive: true, force: true });
}
