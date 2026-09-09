import { createHash, randomBytes } from 'node:crypto';
import { chmod, mkdir, rename, rm, symlink } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { SQL } from 'bun';
import shellAsset from '../../native/postgres/busybox' with { type: 'file' };
import adapterAsset from '../../native/postgres/initdb-shell.so' with { type: 'file' };

const version = '18.4.0-beta.17';
const archiveHash = '795d587bb466423385db256dc81e61f2ee40c9e10efde21e881f3e997dd1bdb2';
export async function startWorkflowDatabase(dataFolder: string, externalUrl?: string) {
  if (externalUrl) {
    return { url: externalUrl, stop: () => Promise.resolve() };
  }
  if (process.platform !== 'linux') {
    throw new Error('Set DBOS_SYSTEM_DATABASE_URL to a PostgreSQL database for local development.');
  }
  const root = join(dataFolder, 'orchestration');
  await mkdir(root, { recursive: true, mode: 0o700 });
  console.log('Preparing workflow database runtime.');
  const binary = await installPostgres(root);
  console.log('Workflow database runtime ready.');
  const data = join(root, 'pgdata');
  const passwordFile = join(root, 'password');
  if (!(await Bun.file(passwordFile).exists())) {
    if (await Bun.file(join(data, 'PG_VERSION')).exists()) {
      throw new Error(
        'Workflow database credential is missing. Restore it from the volume backup.',
      );
    }
    await Bun.write(passwordFile, randomBytes(32).toString('hex'));
    await chmod(passwordFile, 0o600);
  }
  const password = (await Bun.file(passwordFile).text()).trim();
  if (!/^[0-9a-f]{64}$/.test(password)) {
    throw new Error('Invalid persisted workflow database credential.');
  }
  console.log('Workflow database credential ready.');
  const env = {
    PATH: `${binary}/bin:/usr/bin:/bin`,
    LD_LIBRARY_PATH: join(binary, 'lib'),
    LANG: 'C',
    LC_ALL: 'C',
    TMPDIR: root,
  };
  if (!(await Bun.file(join(data, 'PG_VERSION')).exists())) {
    console.log('Initializing workflow database cluster.');
    const staging = join(root, 'initializing');
    await rm(staging, { recursive: true, force: true });
    const shell = join(root, 'busybox');
    const adapter = join(root, 'initdb-shell.so');
    await Bun.write(shell, Bun.file(shellAsset));
    await chmod(shell, 0o700);
    await Bun.write(adapter, Bun.file(adapterAsset));
    console.log('Starting initdb.');
    run(
      [
        join(binary, 'bin/initdb'),
        '-D',
        staging,
        '-U',
        'content_use',
        '--auth=scram-sha-256',
        `--pwfile=${passwordFile}`,
        '--locale=C',
        '--encoding=UTF8',
      ],
      { ...env, LD_PRELOAD: adapter, CONTENT_USE_INITDB_SHELL: shell },
    );
    await rename(staging, data);
  }
  if ((await Bun.file(join(data, 'PG_VERSION')).text()).trim() !== '18') {
    throw new Error('Unexpected PostgreSQL data version. Refusing an automatic upgrade.');
  }
  console.log('Starting PostgreSQL server.');
  const child = Bun.spawn(
    [
      join(binary, 'bin/postgres'),
      '-D',
      data,
      '-h',
      '127.0.0.1',
      '-p',
      '55432',
      '-k',
      root,
      '-c',
      'shared_buffers=16MB',
      '-c',
      'max_connections=12',
      '-c',
      'work_mem=1MB',
      '-c',
      'maintenance_work_mem=16MB',
      '-c',
      'max_wal_size=128MB',
      '-c',
      'min_wal_size=32MB',
      '-c',
      'max_worker_processes=2',
      '-c',
      'max_parallel_workers=0',
      '-c',
      'dynamic_shared_memory_type=mmap',
    ],
    { env, stdout: 'inherit', stderr: 'inherit', stdin: 'ignore' },
  );
  const url = `postgresql://content_use:${password}@127.0.0.1:55432/content_use_dbos`;
  const readiness = new SQL({
    url: url.replace('/content_use_dbos', '/postgres'),
    max: 1,
    connectionTimeout: 1,
  });
  try {
    await waitForPostgres(child, readiness);
  } catch (error) {
    child.kill('SIGINT');
    await child.exited;
    throw error;
  } finally {
    await readiness.close();
  }
  let stopping = false;
  void child.exited.then(() => {
    if (!stopping) {
      console.error('Workflow database stopped unexpectedly.');
      process.exit(1);
    }
  });
  return {
    url,
    stop: async () => {
      stopping = true;
      child.kill('SIGINT');
      await child.exited;
    },
  };
}
async function installPostgres(root: string) {
  const folder = join(root, `postgres-${version}`);
  if (await Bun.file(join(folder, 'ready')).exists()) {
    return join(folder, 'package/native');
  }
  const response = await fetch(
    `https://registry.npmjs.org/@embedded-postgres/linux-x64/-/linux-x64-${version}.tgz`,
    { signal: AbortSignal.timeout(180000) },
  );
  if (!response.ok) {
    throw new Error(`Could not install PostgreSQL: HTTP ${response.status}`);
  }
  console.log('Downloading PostgreSQL runtime.');
  const bytes = await response.arrayBuffer();
  console.log('Extracting PostgreSQL runtime.');
  if (createHash('sha256').update(new Uint8Array(bytes)).digest('hex') !== archiveHash) {
    throw new Error('PostgreSQL archive checksum mismatch.');
  }
  const temporary = join(root, 'runtime-installing');
  await rm(temporary, { recursive: true, force: true });
  await new Bun.Archive(bytes).extract(temporary);
  console.log('PostgreSQL runtime extracted.');
  const packageRoot = join(temporary, 'package');
  const links: { source: string; target: string }[] = await Bun.file(
    join(packageRoot, 'native/pg-symlinks.json'),
  ).json();
  for (const link of links) {
    const source = resolve(packageRoot, link.source),
      target = resolve(packageRoot, link.target);
    if (
      !source.startsWith(`${packageRoot}/native/`) ||
      !target.startsWith(`${packageRoot}/native/`)
    ) {
      throw new Error('Unexpected PostgreSQL library path.');
    }
    await symlink(relative(dirname(target), source), target);
  }
  await Bun.write(join(temporary, 'ready'), archiveHash);
  await rename(temporary, folder);
  return join(folder, 'package/native');
}
function run(command: string[], env: Record<string, string>) {
  const child = Bun.spawnSync(command, {
    env,
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
    timeout: 60000,
  });
  if (child.exitCode !== 0) {
    throw new Error(`PostgreSQL initialization failed: ${child.stderr.toString().slice(-2000)}`);
  }
}

async function waitForPostgres(child: Bun.Subprocess, readiness: SQL) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) {
      throw new Error('PostgreSQL stopped during startup.');
    }
    try {
      await readiness`SELECT 1`;
      break;
    } catch {
      if (attempt === 99) {
        throw new Error('PostgreSQL startup timed out.');
      }
      await Bun.sleep(100);
    }
  }
}
