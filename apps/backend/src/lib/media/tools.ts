import { createHash } from 'node:crypto';
import { chmod, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';

const tools = {
  'yt-dlp': {
    url: 'https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp_linux',
    hash: '58162f9bfdc27458ea47bfcb311cf47028f17d8154a8bf7d689861d46399230a',
  },
  ffmpeg: {
    url: 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-x64',
    hash: 'e7e7fb30477f717e6f55f9180a70386c62677ef8a4d4d1a5d948f4098aa3eb99',
  },
};
export async function installMediaTools(dataFolder: string) {
  const folder = join(dataFolder, 'tools');
  await mkdir(folder, { recursive: true });
  const result: Record<string, string> = {};
  for (const [name, tool] of Object.entries(tools)) {
    if (process.platform !== 'linux') {
      const path = Bun.which(name);
      if (!path) {
        throw new Error(`Install ${name} for local development.`);
      }
      result[name] = path;
      continue;
    }
    const destination = join(folder, `${name}-${tool.hash.slice(0, 12)}`);
    if (!(await Bun.file(destination).exists())) {
      await downloadTool({ name, tool, destination });
    }
    result[name] = destination;
  }
  return { downloader: result['yt-dlp']!, ffmpeg: result.ffmpeg! };
}

async function downloadTool({
  name,
  tool,
  destination,
}: {
  name: string;
  tool: { url: string; hash: string };
  destination: string;
}) {
  const response = await fetch(tool.url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok || !response.body) {
    throw new Error(`Could not download ${name}: HTTP ${response.status}. Retry the record.`);
  }
  const temporary = `${destination}.part`;
  const writer = Bun.file(temporary).writer();
  const hash = createHash('sha256');
  try {
    for await (const chunk of response.body) {
      hash.update(chunk);
      writer.write(chunk);
      await writer.flush();
    }
  } finally {
    await writer.end();
  }
  if (hash.digest('hex') !== tool.hash) {
    throw new Error(`${name} checksum verification failed.`);
  }
  await chmod(temporary, 0o700);
  await rename(temporary, destination);
}
