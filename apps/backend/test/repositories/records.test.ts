import { expect, test } from 'bun:test';
import { SqlitePlaylistsRepository } from '../../src/repositories/playlists/repository';
import { SqliteRecordsRepository } from '../../src/repositories/records/repository';
import { testDatabase } from '../support/database';

test('concurrent record creation reuses owner-scoped source identity without resetting saved state', async () => {
  const db = await testDatabase();
  const repo = new SqliteRecordsRepository(db);
  try {
    const sources = [
      'https://youtu.be/rY0wnfFHYbs',
      'https://www.youtube.com/watch?v=rY0wnfFHYbs',
      'https://www.youtube.com/shorts/rY0wnfFHYbs',
    ];
    const created = await Promise.all(
      sources.map((url, index) =>
        repo.create({ ownerId: 'alice', id: `video-${index}`, title: 'Video', url }),
      ),
    );
    expect(new Set(created.map((record) => record.id)).size).toBe(1);
    const audio = {
      ownerId: 'alice',
      id: 'audio',
      title: 'Audio',
      url: 'https://example.com/talk.mp3',
    };
    await repo.create(audio);
    await repo.finish({ ...audio, markdown: 'Saved captions' });
    expect(await repo.create({ ...audio, id: 'duplicate', title: 'Replacement' })).toMatchObject({
      id: 'audio',
      title: 'Audio',
      status: 'ready',
      markdown: 'Saved captions',
    });
    const foreign = await repo.create({ ...audio, ownerId: 'bob', id: 'bob-audio' });
    expect(foreign.id).toBe('bob-audio');
    expect((await repo.list({ ownerId: 'alice', search: '', offset: 0 })).total).toBe(2);
  } finally {
    await db.close();
  }
});

test('owner scoping prevents cross-owner reads, edits, search, deletion, and chunk access', async () => {
  const db = await testDatabase();
  const repo = new SqliteRecordsRepository(db);
  try {
    const record = await repo.create({
      ownerId: 'alice',
      id: 'private',
      title: 'Private talk',
      url: 'https://example.com/talk.mp3',
    });
    await repo.progress({ ...record, status: 'ready', progress: 'Done' });
    await repo.saveChunk({ ...record, index: 0, text: 'secret' });
    const other = { id: record.id, ownerId: 'bob' };
    expect(await repo.get(other)).toBeNull();
    expect((await repo.list({ ownerId: 'bob', search: '', offset: 0 })).total).toBe(0);
    expect(await repo.edit({ ...other, title: 'stolen', markdown: 'stolen' })).toBeNull();
    expect(await repo.chunk({ ...other, index: 0 })).toBeNull();
    await repo.remove(other);
    expect(await repo.get(record)).not.toBeNull();
    await repo.remove(record);
    expect(await repo.chunk({ ...record, index: 0 })).toBeNull();
  } finally {
    await db.close();
  }
});
test('queue claims once, recovers interrupted work, and keeps transcript checkpoints', async () => {
  const db = await testDatabase();
  const repo = new SqliteRecordsRepository(db);
  try {
    const record = await repo.create({
      ownerId: 'alice',
      id: 'one',
      title: 'one',
      url: 'https://example.com/one',
    });
    expect((await repo.claim())?.id).toBe(record.id);
    expect(await repo.claim()).toBeNull();
    await repo.saveChunk({ ...record, index: 0, text: 'saved words' });
    await repo.recover();
    expect((await repo.claim())?.id).toBe(record.id);
    expect(await repo.chunk({ ...record, index: 0 })).toBe('saved words');
    expect(
      await repo.edit({ ...record, title: 'edit', markdown: 'do not overwrite job' }),
    ).toBeNull();
    await repo.finish({ ...record, markdown: 'saved words' });
    expect((await repo.list({ ownerId: 'alice', search: 'saved', offset: 0 })).total).toBe(1);
    expect((await repo.list({ ownerId: 'alice', search: '%', offset: 0 })).total).toBe(0);
  } finally {
    await db.close();
  }
});

test('status and playlist filters compose before pagination, with owner-scoped membership links', async () => {
  const db = await testDatabase();
  const repo = new SqliteRecordsRepository(db);
  const playlists = new SqlitePlaylistsRepository(db);
  try {
    const createPlaylist = (ownerId: string, title: string) =>
      playlists.create({
        ownerId,
        title,
        youtubeId: `PL${title}`,
        url: `https://www.youtube.com/playlist?list=PL${title}`,
      });
    const first = await createPlaylist('alice', 'Z first imported');
    const second = await createPlaylist('alice', 'A later imported');
    const foreign = await createPlaylist('bob', 'Foreign');
    const videos = Array.from({ length: 55 }, (_, i) => ({
      id: `video${String(i).padStart(6, '0')}`,
      title: `Lecture ${i}`,
    }));
    await playlists.sync({ ownerId: 'alice', id: first, title: 'First', videos });
    await playlists.sync({
      ownerId: 'alice',
      id: second,
      title: 'Second',
      videos: videos.slice(0, 1),
    });
    await playlists.sync({ ownerId: 'bob', id: foreign, title: 'Foreign', videos });
    await db`UPDATE records SET status='ready',markdown='calculus' WHERE owner_id='alice'`;
    const base = { ownerId: 'alice', search: '', offset: 0, playlistId: first };
    const page = await repo.list({ ...base, status: 'ready' });
    expect(page.total).toBe(55);
    expect(page.records).toHaveLength(50);
    const next = await repo.list({ ...base, status: 'ready', offset: 50 });
    expect(next.total).toBe(55);
    expect(next.records).toHaveLength(5);
    expect(new Set([...page.records, ...next.records].map((r) => r.id)).size).toBe(55);
    expect((await repo.list({ ...base, search: 'calculus', status: 'ready' })).total).toBe(55);
    expect((await repo.list({ ...base, search: '%', status: 'ready' })).total).toBe(0);
    const [shared] = (await repo.list({ ...base, playlistId: second })).records;
    const links = await repo.playlistLinks({ ownerId: 'alice', ids: [shared!.id] });
    expect(links.get(shared!.id)).toEqual([{ id: first, title: 'Z first imported' }]);
    expect((await repo.playlistLinks({ ownerId: 'bob', ids: [shared!.id] })).size).toBe(0);
    expect((await repo.list({ ...base, playlistId: foreign })).total).toBe(0);
    expect(await playlists.list({ ownerId: 'bob', id: first })).toEqual([]);
    expect((await playlists.list({ ownerId: 'alice', id: first })).map((p) => p.id)).toEqual([
      first,
    ]);
    for (const [index, status] of ['queued', 'downloading', 'transcribing', 'failed'].entries()) {
      await db`UPDATE records SET status=${status} WHERE id=${page.records[index]!.id}`;
    }
    expect((await repo.list({ ...base, status: 'processing' })).total).toBe(2);
    expect((await repo.list({ ...base, status: 'queued' })).total).toBe(1);
    expect((await repo.list({ ...base, status: 'failed' })).total).toBe(1);
    expect((await repo.list({ ...base, status: 'ready' })).total).toBe(51);
    expect((await repo.list({ ...base, status: 'all' })).total).toBe(55);
    expect((await repo.list({ ...base, status: 'failed', search: 'missing' })).total).toBe(0);
    await repo.remove({ ownerId: 'alice', id: shared!.id });
    expect((await repo.list({ ...base, playlistId: second })).total).toBe(0);
    expect((await repo.playlistLinks({ ownerId: 'alice', ids: [shared!.id] })).size).toBe(0);
  } finally {
    await db.close();
  }
});
