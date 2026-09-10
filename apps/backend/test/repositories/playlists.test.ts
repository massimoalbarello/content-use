import { expect, test } from 'bun:test';
import { SqlitePlaylistsRepository } from '../../src/repositories/playlists/repository';
import { SqliteRecordsRepository } from '../../src/repositories/records/repository';
import { testDatabase } from '../support/database';

test('selective import rolls back its playlist, exclusions, and records together on persistence failure', async () => {
  const db = await testDatabase();
  const playlists = new SqlitePlaylistsRepository(db);
  const records = new SqliteRecordsRepository(db);
  try {
    await db.unsafe(`CREATE TRIGGER reject_video BEFORE INSERT ON records
      WHEN NEW.url='https://www.youtube.com/watch?v=aircAruvnKk'
      BEGIN SELECT RAISE(ABORT, 'Import failed'); END`);
    await expect(
      playlists.importSelected({
        ownerId: 'alice',
        youtubeId: 'PLabcdefghijk',
        url: 'https://www.youtube.com/playlist?list=PLabcdefghijk',
        title: 'Playlist',
        videos: [
          { id: 'rY0wnfFHYbs', title: 'First' },
          { id: 'aircAruvnKk', title: 'Second' },
          { id: 'dQw4w9WgXcQ', title: 'Excluded' },
        ],
        videoIds: ['rY0wnfFHYbs', 'aircAruvnKk'],
      }),
    ).rejects.toThrow('Import failed');
    expect(await playlists.list({ ownerId: 'alice' })).toEqual([]);
    expect((await records.list({ ownerId: 'alice', search: '', offset: 0 })).total).toBe(0);
    expect(await db`SELECT * FROM playlist_videos`).toHaveLength(0);
  } finally {
    await db.close();
  }
});

test('a direct add racing a playlist import still creates one record', async () => {
  const db = await testDatabase();
  const playlists = new SqlitePlaylistsRepository(db);
  const records = new SqliteRecordsRepository(db);
  try {
    const id = await playlists.create({
      ownerId: 'alice',
      youtubeId: 'PLabcdefghijk',
      url: 'https://www.youtube.com/playlist?list=PLabcdefghijk',
      title: 'Playlist',
    });
    const [, record] = await Promise.all([
      playlists.sync({
        ownerId: 'alice',
        id,
        title: 'Playlist',
        videos: [{ id: 'rY0wnfFHYbs', title: 'Video' }],
      }),
      records.create({
        ownerId: 'alice',
        id: 'direct',
        title: 'Video',
        url: 'https://youtu.be/rY0wnfFHYbs',
      }),
    ]);
    expect((await records.list({ ownerId: 'alice', search: '', offset: 0 })).total).toBe(1);
    expect(
      (await records.playlistLinks({ ownerId: 'alice', ids: [record.id] })).get(record.id),
    ).toEqual([{ id, title: 'Playlist' }]);
  } finally {
    await db.close();
  }
});

test('playlist sync reuses individual videos, is idempotent, scopes owners, and preserves deletions', async () => {
  const db = await testDatabase();
  const playlists = new SqlitePlaylistsRepository(db);
  const records = new SqliteRecordsRepository(db);
  try {
    const individual = await records.create({
      ownerId: 'alice',
      id: 'existing',
      title: 'My title',
      url: 'https://youtu.be/rY0wnfFHYbs',
    });
    const id = await playlists.create({
      ownerId: 'alice',
      youtubeId: 'PLabcdefghijk',
      url: 'https://www.youtube.com/playlist?list=PLabcdefghijk',
      title: 'Test',
    });
    const input = {
      ownerId: 'alice',
      id,
      title: 'Source title',
      videos: [
        { id: 'rY0wnfFHYbs', title: 'One' },
        { id: 'aircAruvnKk', title: 'Two' },
        { id: 'aircAruvnKk', title: 'Two' },
      ],
    };
    await playlists.sync(input);
    await playlists.sync(input);
    expect((await records.list({ ownerId: 'alice', search: '', offset: 0 })).total).toBe(2);
    expect((await records.get(individual))?.title).toBe('My title');
    expect(await playlists.list({ ownerId: 'bob' })).toHaveLength(0);
    expect(await playlists.setEnabled({ ownerId: 'bob', id, enabled: false })).toBe(false);
    await records.remove(individual);
    await playlists.sync(input);
    expect((await records.list({ ownerId: 'alice', search: '', offset: 0 })).total).toBe(1);
    await playlists.setEnabled({ ownerId: 'alice', id, enabled: false });
    await playlists.sync({ ...input, videos: [{ id: 'dQw4w9WgXcQ', title: 'New' }] });
    expect((await records.list({ ownerId: 'alice', search: '', offset: 0 })).total).toBe(1);
    expect(await playlists.due(new Date(Date.now() + 7200000).toISOString())).toHaveLength(0);
  } finally {
    await db.close();
  }
});

test('poll history preserves counts on replay, isolates owners, and distinguishes failures and pauses', async () => {
  const db = await testDatabase();
  const repository = new SqlitePlaylistsRepository(db);
  try {
    const id = await repository.create({
      ownerId: 'alice',
      youtubeId: 'PLabcdefghijk',
      url: 'https://www.youtube.com/playlist?list=PLabcdefghijk',
      title: 'Test',
    });
    const input = {
      ownerId: 'alice',
      id,
      pollId: 'first',
      title: 'Test',
      videos: [
        { id: 'rY0wnfFHYbs', title: 'One' },
        { id: 'rY0wnfFHYbs', title: 'One' },
      ],
    };
    expect(await repository.beginPoll({ ...input, ownerId: 'bob' })).toBe(false);
    expect(await repository.beginPoll(input)).toBe(true);
    expect(await repository.beginPoll(input)).toBe(true);
    await repository.sync(input);
    await repository.sync(input);
    expect(await repository.beginPoll(input)).toBe(false);
    let playlist = (await repository.list({ ownerId: 'alice' }))[0]!;
    expect(playlist.polls[0]).toMatchObject({
      status: 'succeeded',
      attempts: 2,
      scannedCount: 1,
      addedCount: 1,
      linkedCount: 0,
    });
    expect(playlist.pendingCount).toBe(1);
    expect(await repository.list({ ownerId: 'bob' })).toHaveLength(0);
    const failed = { ...input, pollId: 'failed' };
    await repository.beginPoll(failed);
    await repository.failure({ ...failed, error: 'YouTube unavailable' });
    playlist = (await repository.list({ ownerId: 'alice' }))[0]!;
    expect(playlist.polls.find((p) => p.id === 'failed')).toMatchObject({
      status: 'failed',
      addedCount: null,
      error: 'YouTube unavailable',
    });
    expect(playlist.error).toBe('YouTube unavailable');
    expect(new Date(playlist.nextCheckAt).getTime()).toBeGreaterThan(Date.now());
    const paused = { ...input, pollId: 'paused' };
    await repository.beginPoll(paused);
    await repository.setEnabled({ ...input, enabled: false });
    await repository.setEnabled({ ...input, enabled: true });
    await repository.sync({ ...paused, videos: [{ id: 'aircAruvnKk', title: 'Two' }] });
    await repository.failure({ ...paused, error: 'Stale failure' });
    playlist = (await repository.list({ ownerId: 'alice' }))[0]!;
    expect(playlist.polls.find((p) => p.id === 'paused')?.status).toBe('cancelled');
    expect(playlist.videoCount).toBe(1);
    expect(playlist.error).toBe('YouTube unavailable');
    const records = new SqliteRecordsRepository(db);
    const record = (await records.list({ ownerId: 'alice', search: '', offset: 0 })).records[0]!;
    await db`UPDATE records SET next_attempt_at='2030-01-01T00:00:00.000Z' WHERE id=${record.id}`;
    expect((await repository.list({ ownerId: 'alice' }))[0]?.retryAt).toBe(
      '2030-01-01T00:00:00.000Z',
    );
    await records.progress({
      ...record,
      status: 'failed',
      progress: 'Needs attention',
      error: 'No captions',
    });
    playlist = (await repository.list({ ownerId: 'alice' }))[0]!;
    expect(playlist.failedCount).toBe(1);
    expect(playlist.pendingCount).toBe(0);
    expect(playlist.retryAt).toBeNull();
  } finally {
    await db.close();
  }
});

test('playlist checks fill missing durations without losing captions, ownership, or deletion tombstones', async () => {
  const db = await testDatabase();
  const playlists = new SqlitePlaylistsRepository(db);
  const records = new SqliteRecordsRepository(db);
  try {
    const individual = await records.create({
      ownerId: 'alice',
      id: 'individual',
      title: 'My edit',
      url: 'https://youtu.be/rY0wnfFHYbs',
    });
    await records.finish({ ...individual, markdown: 'Keep my transcript' });
    const foreign = await records.create({
      ownerId: 'bob',
      id: 'foreign',
      title: 'Private',
      url: individual.url,
    });
    const id = await playlists.create({
      ownerId: 'alice',
      youtubeId: 'PLduration',
      title: 'Durations',
      url: 'https://www.youtube.com/playlist?list=PLduration',
    });
    const input = { ownerId: 'alice', id, title: 'Durations' };
    await playlists.sync({
      ...input,
      videos: [
        { id: 'rY0wnfFHYbs', title: 'Source', duration: 120 },
        { id: 'aircAruvnKk', title: 'New', duration: 600 },
      ],
    });
    expect((await records.get(individual))?.duration).toBe(120);
    expect((await records.get(individual))?.title).toBe('My edit');
    expect((await records.get(individual))?.markdown).toBe('Keep my transcript');
    expect((await records.get(foreign))?.duration).toBeNull();
    const created = (await records.list({ ownerId: 'alice', search: 'New', offset: 0 }))
      .records[0]!;
    expect(created.duration).toBe(600);
    await records.saveCaptions({ ...created, markdown: 'Downloaded captions', duration: null });
    expect((await records.get(created))?.duration).toBe(600);
    await db`UPDATE records SET duration=NULL WHERE id=${individual.id}`;
    await playlists.sync({
      ...input,
      videos: [{ id: 'rY0wnfFHYbs', title: 'Source', duration: 125 }],
    });
    expect((await records.get(individual))?.duration).toBe(125);
    await playlists.sync({
      ...input,
      videos: [{ id: 'rY0wnfFHYbs', title: 'Source', duration: null }],
    });
    expect((await records.get(individual))?.duration).toBe(125);
    await records.remove(individual);
    await playlists.sync({
      ...input,
      videos: [{ id: 'rY0wnfFHYbs', title: 'Source', duration: 125 }],
    });
    expect(await records.get(individual)).toBeNull();
    expect((await records.list({ ownerId: 'alice', search: '', offset: 0 })).total).toBe(1);
  } finally {
    await db.close();
  }
});
