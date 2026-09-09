import { mkdir, readdir, rm, statfs } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { type Actor, type ContentRecord, youtubeEmbed } from '#models/records.ts';
import { parseCaptions, selectCaption } from './captions';
import type { HostedCaptions } from './hosted-captions';
import { runMediaProcess } from './process';
import { createDownloadProxy } from './proxy';
import { installMediaTools } from './tools';
export class MediaPipeline {
  private tools: ReturnType<typeof installMediaTools> | undefined;
  constructor(
    private readonly dataFolder: string,
    private readonly hostedCaptions?: HostedCaptions,
  ) {}
  folder({ ownerId, id }: Actor & { id: string }) {
    return join(this.dataFolder, 'records', ownerId, id);
  }
  mediaPath(input: Actor & { id: string; name: string }) {
    return join(this.folder(input), basename(input.name));
  }
  async deleteFiles(input: Actor & { id: string }) {
    await rm(this.folder(input), { recursive: true, force: true });
  }
  async prepare() {
    const tools = await this.binaries();
    const signal = AbortSignal.timeout(60000);
    await runMediaProcess({
      command: [tools.downloader, '--version'],
      cwd: this.dataFolder,
      signal,
    });
    await runMediaProcess({ command: [tools.ffmpeg, '-version'], cwd: this.dataFolder, signal });
  }
  binaries() {
    this.tools ??= installMediaTools(this.dataFolder).catch((error) => {
      this.tools = undefined;
      throw error;
    });
    return this.tools;
  }
  async captions({ record, signal }: { record: ContentRecord; signal: AbortSignal }) {
    if (this.hostedCaptions && youtubeEmbed(record.url)) {
      return this.hostedCaptions.fetch(record.url, signal);
    }
    const folder = this.folder(record);
    await mkdir(folder, { recursive: true });
    const { downloader } = await this.binaries();
    const proxy = await createDownloadProxy();
    const options = [
      downloader,
      '--ignore-config',
      '--no-playlist',
      '--no-warnings',
      '--no-progress',
      '--no-cache-dir',
      '--socket-timeout',
      '20',
      '--retries',
      '1',
      '--proxy',
      proxy.url,
      '--geo-verification-proxy',
      proxy.url,
      '--js-runtimes',
      `bun:${process.execPath}`,
      '--skip-download',
      '--output',
      'captions.%(ext)s',
    ];
    try {
      await runMediaProcess({
        command: [...options, '--write-info-json', '--', record.url],
        cwd: folder,
        signal,
        watchedFolder: folder,
      });
      const info = await Bun.file(join(folder, 'captions.info.json')).json();
      const metadata = {
        title: typeof info.title === 'string' ? info.title.slice(0, 300) : record.title,
        duration: typeof info.duration === 'number' ? info.duration : null,
      };
      const track = selectCaption(info);
      if (!track) {
        return { ...metadata, markdown: '' };
      }
      await runMediaProcess({
        command: [
          ...options,
          '--load-info-json',
          join(folder, 'captions.info.json'),
          track.automatic ? '--write-auto-subs' : '--write-subs',
          '--sub-langs',
          `^${track.language.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
          '--sub-format',
          'json3/vtt/srt',
        ],
        cwd: folder,
        signal,
        watchedFolder: folder,
      });
      const filename = (await readdir(folder)).find((name) =>
        /^captions\..+\.(json3|vtt|srt)$/.test(name),
      );
      if (!filename) {
        throw new Error('The source lists captions but did not return a caption file.');
      }
      const format = filename.split('.').at(-1) as 'json3' | 'vtt' | 'srt';
      const file = Bun.file(join(folder, filename));
      if (file.size > 1800000) {
        throw new Error('Caption file exceeds the 1.8 MB limit.');
      }
      const content: string = await file.text();
      return { ...metadata, markdown: parseCaptions(content, format) };
    } finally {
      proxy.close();
    }
  }
  async download({ record, signal }: { record: ContentRecord; signal: AbortSignal }) {
    const folder = this.folder(record);
    await mkdir(folder, { recursive: true });
    const disk = await statfs(this.dataFolder);
    if (disk.bavail * disk.bsize < 600 * 1024 * 1024) {
      throw new Error('Storage is nearly full. Delete a recording before adding another.');
    }
    const { downloader } = await this.binaries();
    const proxy = await createDownloadProxy();
    try {
      await runMediaProcess({
        command: [
          downloader,
          '--ignore-config',
          '--no-playlist',
          '--playlist-items',
          '1',
          '--no-warnings',
          '--no-progress',
          '--no-cache-dir',
          '--socket-timeout',
          '30',
          '--retries',
          '2',
          '--fragment-retries',
          '2',
          '--max-filesize',
          '200M',
          '--match-filters',
          '!is_live & duration <? 10800',
          '--proxy',
          proxy.url,
          '--geo-verification-proxy',
          proxy.url,
          '--js-runtimes',
          `bun:${process.execPath}`,
          '--downloader',
          'native',
          '--write-info-json',
          '--no-clean-info-json',
          '--no-part',
          '--no-continue',
          '--force-overwrites',
          '--format',
          'b[ext=mp4]/b/ba',
          '--output',
          'media.%(ext)s',
          '--',
          record.url,
        ],
        cwd: folder,
        signal,
        watchedFolder: folder,
      });
      const files = await readdir(folder);
      const infoFile = files.find((file) => file.endsWith('.info.json'));
      if (!infoFile) {
        throw new Error(
          'No downloadable media found. Live streams and recordings over 3 hours are not supported.',
        );
      }
      const info = await Bun.file(join(folder, infoFile)).json();
      const filename = files.find((file) =>
        /^media\.(mp4|m4a|webm|mp3|wav|ogg|opus|mkv|mov|aac|flac|mpeg|mpg)$/.test(file),
      );
      if (!filename || !Bun.file(join(folder, filename)).size) {
        throw new Error('No supported audio or video was downloaded (limit: 200 MB).');
      }
      if (Bun.file(join(folder, filename)).size > 200 * 1024 * 1024) {
        throw new Error('This recording exceeds the 200 MB download limit.');
      }
      return {
        name: filename,
        title: typeof info.title === 'string' ? info.title.slice(0, 300) : record.url,
        type:
          info.vcodec === 'none' || /\.(m4a|mp3|wav|ogg|opus|aac|flac)$/.test(filename)
            ? ('audio' as const)
            : ('video' as const),
        duration: typeof info.duration === 'number' ? info.duration : null,
      };
    } finally {
      proxy.close();
    }
  }
}
