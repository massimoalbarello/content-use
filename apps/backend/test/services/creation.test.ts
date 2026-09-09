import { expect, test } from 'bun:test';
import { SqlitePlaylistsRepository } from '../../src/repositories/playlists/repository';
import { SqliteRecordsRepository } from '../../src/repositories/records/repository';
import { PlaylistsService } from '../../src/services/playlists/service';
import { RecordsService } from '../../src/services/records/service';
import { testDatabase } from '../support/database';

test('URL-only creation adopts source titles for videos and playlists', async () => {
  const db = await testDatabase();
  const records = new SqliteRecordsRepository(db);
  const playlists = new SqlitePlaylistsRepository(db);
  const jobs = {
    wake() {},
    cancel: () => Promise.resolve(),
    deleteFiles: () => Promise.resolve(),
    mediaPath: () => '',
  };
  const videoService = new RecordsService(records, jobs, (url) => Promise.resolve(url));
  const playlistService = new PlaylistsService(playlists, jobs, {
    list: () =>
      Promise.resolve({
        title: 'Source playlist',
        videos: [{ id: 'rY0wnfFHYbs', title: 'Source video' }],
      }),
  });
  try {
    const ownerId = 'alice';
    const video = await videoService.create({ ownerId, url: 'https://youtu.be/rY0wnfFHYbs' });
    await records.saveCaptions({
      ownerId,
      id: video.id,
      title: 'Source video',
      markdown: 'Captions',
      duration: 90,
    });
    expect((await videoService.get({ ownerId, id: video.id })).title).toBe('Source video');
    expect(await videoService.markdown({ ownerId, id: video.id })).toContain('## Captions');
    const playlist = await playlistService.create(
      {
        ownerId,
        url: 'https://www.youtube.com/playlist?list=PLZHQObOWTQDMsr9K-rj53DwVRMYO3t5Yr',
        videoIds: ['rY0wnfFHYbs'],
      },
      new AbortController().signal,
    );
    await playlists.sync({ ownerId, id: playlist.id, title: 'Source playlist', videos: [] });
    expect((await playlistService.get({ ownerId, id: playlist.id })).title).toBe('Source playlist');
  } finally {
    await db.close();
  }
});
