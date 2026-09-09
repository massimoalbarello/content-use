import type { MediaPipeline } from './pipeline';
import { runMediaProcess } from './process';
import { createDownloadProxy } from './proxy';

export async function youtubeListing(input: {
  pipeline: Pick<MediaPipeline, 'binaries'>;
  dataFolder: string;
  url: string;
  limit: number;
  signal: AbortSignal;
}) {
  const { downloader } = await input.pipeline.binaries();
  const proxy = await createDownloadProxy();
  try {
    return await runMediaProcess({
      command: [
        downloader,
        '--ignore-config',
        '--flat-playlist',
        '--skip-download',
        '--dump-single-json',
        '--no-cache-dir',
        '--no-warnings',
        '--socket-timeout',
        '20',
        '--retries',
        '2',
        '--extractor-retries',
        '2',
        '--playlist-end',
        String(input.limit + 1),
        '--proxy',
        proxy.url,
        '--geo-verification-proxy',
        proxy.url,
        '--',
        input.url,
      ],
      cwd: input.dataFolder,
      signal: input.signal,
      maxStdoutBytes: 16 * 1024 * 1024,
    });
  } finally {
    proxy.close();
  }
}
