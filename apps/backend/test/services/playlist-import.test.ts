import { expect, test } from 'bun:test';
import { SqlitePlaylistsRepository } from '../../src/repositories/playlists/repository';
import { SqliteRecordsRepository } from '../../src/repositories/records/repository';
import { PlaylistsService } from '../../src/services/playlists/service';
import { RecordsService } from '../../src/services/records/service';
import { testDatabase } from '../support/database';

const videos = [
  { id: 'rY0wnfFHYbs', title: 'Shared video', duration: 90 },
  { id: 'aircAruvnKk', title: 'Excluded video', duration: 120 },
];
const url = 'https://www.youtube.com/playlist?list=PLabcdefghijk';
const jobs = {
  wake() {},
  cancel: () => Promise.resolve(),
  deleteFiles: () => Promise.resolve(),
  mediaPath: () => '',
};

test('preview is read-only; selective imports are atomic, deduplicated, and preserve exclusions on future checks', async () => {
  const db = await testDatabase();
  const playlists = new SqlitePlaylistsRepository(db);
  const records = new SqliteRecordsRepository(db);
  const service = new PlaylistsService(playlists, jobs, {
    list: () => Promise.resolve({ title: 'Z first playlist', videos: [...videos, videos[0]!] }),
  });
  const signal = new AbortController().signal;
  const actor = { ownerId: 'alice' };
  try {
    expect((await service.preview({ ...actor, url }, signal)).videos).toEqual(videos);
    expect(await service.list(actor)).toEqual([]);
    expect((await records.list({ ...actor, search: '', offset: 0 })).total).toBe(0);
    const input = { ...actor, url, videoIds: [videos[0]!.id, videos[0]!.id] };
    const { id } = await service.create(input, signal);
    expect(await service.create({ ...input, url: `${url}&index=2` }, signal)).toEqual({ id });
    expect(await playlists.due()).toEqual([]);
    const poll = { ...actor, id, pollId: 'next-check' };
    await playlists.beginPoll(poll);
    await playlists.sync({
      ...poll,
      title: 'Source title',
      videos: [...videos, { id: 'dQw4w9WgXcQ', title: 'New addition' }],
    });
    expect((await service.get({ ...actor, id })).polls[0]).toMatchObject({
      scannedCount: 3,
      addedCount: 1,
    });
    const saved = await records.list({ ...actor, search: '', offset: 0 });
    expect(saved.total).toBe(2);
    expect(saved.records.some((record) => record.title === 'Excluded video')).toBe(false);
    // Selecting a previously excluded video is an explicit import, unlike an hourly check.
    await service.create({ ...input, videoIds: videos.map((video) => video.id) }, signal);
    expect((await records.list({ ...actor, search: '', offset: 0 })).total).toBe(3);
    const foreign = await service.create({ ...input, ownerId: 'bob' }, signal);
    expect(foreign.id).not.toBe(id);
    expect((await records.list({ ownerId: 'bob', search: '', offset: 0 })).total).toBe(1);
  } finally {
    await db.close();
  }
});

test('unavailable or tampered selection cannot save a playlist or partially add records', async () => {
  const db = await testDatabase();
  const playlists = new SqlitePlaylistsRepository(db);
  const records = new SqliteRecordsRepository(db);
  let unavailable = false;
  const service = new PlaylistsService(playlists, jobs, {
    list: () =>
      unavailable
        ? Promise.reject(new Error('YouTube unavailable'))
        : Promise.resolve({ title: 'Playlist', videos }),
  });
  const signal = new AbortController().signal;
  const input = { ownerId: 'alice', url };
  try {
    for (const videoIds of [[], [videos[0]!.id, 'dQw4w9WgXcQ']]) {
      await expect(service.create({ ...input, videoIds }, signal)).rejects.toMatchObject({
        status: 400,
      });
    }
    await expect(
      service.preview({ ...input, url: 'https://example.com/' }, signal),
    ).rejects.toMatchObject({ status: 400 });
    unavailable = true;
    await expect(
      service.create({ ...input, videoIds: [videos[0]!.id] }, signal),
    ).rejects.toMatchObject({ status: 503 });
    expect(await service.list(input)).toEqual([]);
    expect((await records.list({ ...input, search: '', offset: 0 })).total).toBe(0);
  } finally {
    await db.close();
  }
});

test('direct and playlist imports reuse the same record and retain the first importing playlist', async () => {
  const db = await testDatabase();
  const playlists = new SqlitePlaylistsRepository(db);
  const records = new SqliteRecordsRepository(db);
  const recordService = new RecordsService(records, jobs, (source) => Promise.resolve(source));
  const service = new PlaylistsService(playlists, jobs, {
    list: (source) =>
      Promise.resolve({ title: source === url ? 'Z first imported' : 'A imported later', videos }),
  });
  const signal = new AbortController().signal;
  const ownerId = 'alice';
  try {
    const direct = await recordService.create({
      ownerId,
      url: 'https://youtu.be/rY0wnfFHYbs?t=30',
    });
    await records.saveCaptions({
      ownerId,
      id: direct.id,
      title: 'Edited title',
      markdown: 'Saved captions',
      duration: 60,
    });
    await records.saveChunk({ ownerId, id: direct.id, index: 0, text: 'Checkpoint' });
    // Create the later importer first: attribution follows membership, not playlist creation/title.
    const laterUrl = 'https://www.youtube.com/playlist?list=PL01234567890';
    const later = await playlists.create({
      ownerId,
      url: laterUrl,
      youtubeId: 'PL01234567890',
      title: 'A imported later',
    });
    const first = await service.create(
      { ownerId, url, videoIds: videos.map((video) => video.id) },
      signal,
    );
    expect(
      await service.create(
        { ownerId, url: laterUrl, videoIds: videos.map((video) => video.id) },
        signal,
      ),
    ).toEqual({ id: later });
    for (const source of [
      'https://www.youtube.com/watch?v=rY0wnfFHYbs&list=PLabcdefghijk',
      'https://m.youtube.com/shorts/rY0wnfFHYbs',
      'https://music.youtube.com/watch?v=rY0wnfFHYbs',
      'https://www.youtube.com/embed/rY0wnfFHYbs',
    ]) {
      const reused = await recordService.create({ ownerId, url: source });
      expect(reused).toMatchObject({
        id: direct.id,
        title: 'Edited title',
        markdown: 'Saved captions',
        duration: 60,
        playlists: [{ id: first.id, title: 'Z first imported' }],
      });
    }
    const playlistFirst = await recordService.create({
      ownerId,
      url: 'https://youtu.be/aircAruvnKk',
    });
    expect(playlistFirst.title).toBe('Excluded video');
    expect(playlistFirst.playlists).toEqual([{ id: first.id, title: 'Z first imported' }]);
    expect(await records.chunk({ ownerId, id: direct.id, index: 0 })).toBe('Checkpoint');
    expect((await records.list({ ownerId, search: '', offset: 0 })).total).toBe(2);
    expect((await records.list({ ownerId, search: '', offset: 0, playlistId: later })).total).toBe(
      2,
    );
  } finally {
    await db.close();
  }
});
