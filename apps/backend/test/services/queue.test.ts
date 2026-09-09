import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteDatabase } from '../../src/db/client';
import { migrate } from '../../src/db/migrate';
import { SqlitePlaylistsRepository } from '../../src/repositories/playlists/repository';
import { SqliteRecordsRepository } from '../../src/repositories/records/repository';

test('compiled SQLite worker survives killed processes, rate limits, cancelled work and repeated playlist polls', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'content-use-queue-'));
  const binary = join(folder, 'worker');
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, 'fixtures/queue-process.ts')],
    compile: { outfile: binary },
    target: 'bun',
  });
  expect(result.success).toBe(true);
  const db = await createSqliteDatabase({ dataFolder: folder });
  await migrate(db);
  await db`INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES ('alice','Alice','alice@example.com',1,'2026-01-01','2026-01-01')`;
  const records = new SqliteRecordsRepository(db);
  const playlists = new SqlitePlaylistsRepository(db);
  const sourceFile = join(folder, 'source.json');
  const videos = [{ id: 'rY0wnfFHYbs', title: 'One' }];
  const configure = (extra: object = {}) =>
    Bun.write(sourceFile, JSON.stringify({ videos, ...extra }));
  let child: Bun.Subprocess<'pipe', 'pipe', 'pipe'> | undefined;
  let output = '';
  const start = () => {
    child = Bun.spawn([binary, folder], { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
    void new Response(child.stdout).text().then((text) => {
      output += text;
    });
    void new Response(child.stderr).text().then((text) => {
      output += text;
    });
  };
  const kill = async () => {
    child?.kill('SIGKILL');
    await child?.exited;
    child = undefined;
  };
  const list = async () =>
    (await records.list({ ownerId: 'alice', search: '', offset: 0 })).records;
  const events = async () => {
    const file = Bun.file(join(folder, 'events.jsonl'));
    if (!(await file.exists())) {
      return [];
    }
    return (await file.text())
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  };
  try {
    const playlistId = await playlists.create({
      ownerId: 'alice',
      youtubeId: 'PLabcdefghijk',
      url: 'https://www.youtube.com/playlist?list=PLabcdefghijk',
      title: 'Playlist',
    });
    const retryAt = Date.now() + 3500;
    await configure({ retryAt });
    start();
    await until(async () => (await list())[0]?.progress.startsWith('Retry scheduled') ?? false);
    const recordId = (await list())[0]!.id;
    expect((await events()).filter((event) => event.event === 'caption')).toHaveLength(1);
    await kill();
    await configure();
    start();
    await until(async () => (await list())[0]?.status === 'ready');
    const captions = (await events()).filter((event) => event.event === 'caption');
    expect(captions).toHaveLength(2);
    expect(captions[1].time).toBeGreaterThanOrEqual(retryAt);
    expect((await events()).filter((event) => event.event === 'poll')).toHaveLength(1);
    expect((await playlists.list({ ownerId: 'alice' }))[0]?.polls[0]).toMatchObject({
      status: 'succeeded',
      addedCount: 1,
      scannedCount: 1,
    });

    // An interrupted active handler is reclaimed, and completed work stays complete.
    videos.push({ id: 'aircAruvnKk', title: 'Two' });
    await configure({ hold: true });
    await db`UPDATE playlists SET next_check_at=${new Date().toISOString()} WHERE id=${playlistId}`;
    child!.stdin.write('wake\n');
    await until(
      async () => (await events()).filter((event) => event.event === 'caption').length === 3,
    );
    await kill();
    await configure();
    start();
    await until(
      async () => (await list()).length === 2 && (await list()).every((r) => r.status === 'ready'),
    );
    expect(
      (await events()).filter((event) => event.event === 'caption' && event.id === recordId),
    ).toHaveLength(2);
    expect((await playlists.list({ ownerId: 'alice' }))[0]?.polls[0]).toMatchObject({
      status: 'succeeded',
      addedCount: 1,
      scannedCount: 2,
    });

    // Repeated discoveries do not duplicate records or consume more caption requests.
    await db`UPDATE playlists SET next_check_at=${new Date().toISOString()} WHERE id=${playlistId}`;
    child!.stdin.write('wake\n');
    await until(
      async () => (await playlists.list({ ownerId: 'alice' }))[0]?.polls[0]?.addedCount === 0,
    );
    expect(await list()).toHaveLength(2);
    expect((await events()).filter((event) => event.event === 'caption')).toHaveLength(4);

    // Deleted queued records never call the caption service when their delay expires.
    await configure({ retryAt: Date.now() + 2000 });
    const deleted = await records.create({
      ownerId: 'alice',
      id: 'deleted',
      title: 'Deleted',
      url: 'https://youtu.be/abcdefghijk',
    });
    child!.stdin.write('wake\n');
    await until(
      async () => (await records.get(deleted))?.progress.startsWith('Retry scheduled') ?? false,
    );
    await records.remove(deleted);
    await configure();
    await Bun.sleep(2300);
    expect((await events()).filter((event) => event.id === 'deleted')).toHaveLength(1);
    expect(await records.get(deleted)).toBeNull();

    // Permanent errors stop, and ordinary retries retain their deadline and counter.
    await configure({ permanent: true });
    const failed = await records.create({
      ownerId: 'alice',
      id: 'failed',
      title: 'Failed',
      url: 'https://youtu.be/zyxwvutsrqp',
    });
    child!.stdin.write('wake\n');
    await until(async () => (await records.get(failed))?.status === 'failed');
    await configure({ transient: true });
    await records.retry(failed);
    child!.stdin.write('wake\n');
    await until(
      async () => (await records.get(failed))?.progress.startsWith('Retry scheduled') ?? false,
    );
    const [state] = await db`SELECT attempts,next_attempt_at FROM records WHERE id='failed'`;
    expect(state.attempts).toBe(1);
    expect(Date.parse(state.next_attempt_at)).toBeGreaterThan(Date.now() + 20000);
    // The persisted scheduler discovers due playlists without an API wake after restart.
    videos.push({ id: '0123456789a', title: 'Scheduled' });
    await configure();
    await db`UPDATE playlists SET next_check_at=${new Date().toISOString()} WHERE id=${playlistId}`;
    await until(
      async () => (await playlists.list({ ownerId: 'alice' }))[0]?.readyCount === 3,
      70000,
    );
    const [schedule] =
      await db`SELECT checked_at,next_check_at FROM playlists WHERE id=${playlistId}`;
    const interval = Date.parse(schedule.next_check_at) - Date.parse(schedule.checked_at);
    expect(interval).toBeGreaterThanOrEqual(3600000);
    expect(interval).toBeLessThan(3601000);

    child!.kill('SIGTERM');
    expect(await child!.exited).toBe(0);
    child = undefined;
  } catch (error) {
    await kill();
    throw new Error(
      `${String(error)}\n${JSON.stringify(await list())}\n${JSON.stringify(await events())}\n${output}`,
      { cause: error },
    );
  } finally {
    await kill();
    await db.close();
    await rm(folder, { recursive: true, force: true });
  }
}, 120000);

async function until(check: () => Promise<boolean>, timeout = 20000) {
  for (let i = 0; i < timeout / 100; i++) {
    if (await check()) {
      return;
    }
    await Bun.sleep(100);
  }
  throw new Error('Queue did not reach expected state.');
}
