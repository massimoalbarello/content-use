import { readdir, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
export async function runMediaProcess({
  command,
  cwd,
  signal,
  watchedFolder,
  maxStdoutBytes,
}: {
  command: string[];
  cwd: string;
  signal: AbortSignal;
  watchedFolder?: string;
  maxStdoutBytes?: number;
}) {
  signal.throwIfAborted();
  // Pass only the runtime environment the tools require; never pass transcription credentials.
  const processHandle = Bun.spawn(command, {
    cwd,
    env: {
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      TMPDIR: cwd,
      XDG_CACHE_HOME: cwd,
      LANG: 'C.UTF-8',
      LD_LIBRARY_PATH: dirname(command[0]!),
      BUN_BE_BUN: '1',
    },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  let exceeded = false;
  const stop = () => processHandle.kill('SIGKILL');
  signal.addEventListener('abort', stop, { once: true });
  const deadline = setTimeout(stop, 20 * 60 * 1000);
  const monitor = watchedFolder
    ? setInterval(() => {
        void readdir(watchedFolder)
          .then(async (files) => {
            const sizes = await Promise.all(
              files.map((name) => stat(`${watchedFolder}/${name}`).then((file) => file.size)),
            );
            if (sizes.reduce((total, size) => total + size, 0) > 202 * 1024 * 1024) {
              exceeded = true;
              stop();
            }
          })
          .catch(() => {});
      }, 1000)
    : undefined;
  async function tail(stream: ReadableStream<Uint8Array>, limit?: number) {
    let output = '';
    const decoder = new TextDecoder();
    for await (const bytes of stream) {
      output += decoder.decode(bytes, { stream: true });
      if (limit && output.length > limit) {
        stop();
        throw new Error('Playlist metadata exceeds the supported size.');
      }
      if (!limit) {
        output = output.slice(-16000);
      }
    }
    return output;
  }
  try {
    const [stdout, stderr, code] = await Promise.all([
      tail(processHandle.stdout, maxStdoutBytes),
      tail(processHandle.stderr),
      processHandle.exited,
    ]);
    signal.throwIfAborted();
    if (exceeded) {
      throw new Error('This recording exceeds the 200 MB download limit.');
    }
    if (code !== 0) {
      throw new Error(
        stderr
          .replace(/https?:\/\/\S+/g, '[source]')
          .slice(-1500)
          .trim() || 'Media processing timed out or was interrupted. Retry this record.',
      );
    }
    return stdout;
  } finally {
    clearTimeout(deadline);
    clearInterval(monitor);
    signal.removeEventListener('abort', stop);
  }
}
