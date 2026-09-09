import { expect, test } from 'bun:test';
import type { AccountDiscovery } from '../../src/models/accounts';
import { SqliteAccountsRepository } from '../../src/repositories/accounts/repository';
import { SqlitePlaylistsRepository } from '../../src/repositories/playlists/repository';
import { SqliteRecordsRepository } from '../../src/repositories/records/repository';
import { AccountsService } from '../../src/services/accounts/service';
import { testDatabase } from '../support/database';

const source: AccountDiscovery = {
  youtubeId: 'UCN2hRGM8-gNDN5feecorWaQ',
  url: 'https://www.youtube.com/channel/UCN2hRGM8-gNDN5feecorWaQ',
  title: 'Example',
  playlists: ['PLabcdefghijk', 'PL01234567890', 'PLnotselected'].map((youtubeId) => ({
    youtubeId,
    title: youtubeId,
    url: `https://www.youtube.com/playlist?list=${youtubeId}`,
  })),
};

test('accounts select playlists for the existing polling flow and retain records when removed', async () => {
  const db = await testDatabase();
  const repository = new SqliteAccountsRepository(db);
  const playlists = new SqlitePlaylistsRepository(db);
  const records = new SqliteRecordsRepository(db);
  const service = new AccountsService(
    repository,
    playlists,
    { list: () => Promise.resolve(source) },
    { wake() {} },
  );
  const signal = new AbortController().signal;
  const ownerId = 'alice';
  try {
    const { id } = await service.create({ ownerId, url: '@example' }, signal);
    expect(await playlists.due()).toEqual([]);
    await service.edit({ ownerId, id, title: ' My account ' });
    expect(await service.create({ ownerId, url: source.url }, signal)).toEqual({ id });
    expect(await service.get({ ownerId, id })).toEqual({
      id,
      title: 'My account',
      url: source.url,
      youtubeId: source.youtubeId,
    });
    const other = await service.create({ ownerId, url: '@second' }, signal);
    expect(other.id).toBe(id);
    const standalone = await playlists.create({ ownerId, ...source.playlists[0]! });
    await playlists.setEnabled({ ownerId, id: standalone, enabled: false });
    const input = {
      ownerId,
      id,
      youtubeIds: source.playlists.slice(0, 2).map((playlist) => playlist.youtubeId),
    };
    const result = await service.follow(input, signal);
    expect(result.ids[0]).toBe(standalone);
    expect(await service.follow(input, signal)).toEqual(result);
    expect(await playlists.due()).toHaveLength(2);
    expect(
      (await playlists.list({ ownerId })).every(
        (playlist) => playlist.account?.id === id && playlist.enabled,
      ),
    ).toBe(true);
    expect(await records.list({ ownerId, search: '', offset: 0 })).toMatchObject({ total: 0 });
    await playlists.sync({
      ownerId,
      id: standalone,
      title: 'Source',
      videos: [{ id: 'rY0wnfFHYbs', title: 'Video' }],
    });
    const record = (await records.list({ ownerId, search: '', offset: 0 })).records[0]!;
    await records.saveCaptions({
      ownerId,
      id: record.id,
      title: 'Video',
      markdown: 'Saved captions',
      duration: 30,
    });
    await service.edit({ ownerId, id, title: 'Renamed' });
    expect((await playlists.list({ ownerId }))[0]?.account?.title).toBe('Renamed');
    await service.remove({ ownerId, id });
    expect(await service.list({ ownerId })).toEqual([]);
    const retained = await playlists.list({ ownerId });
    expect(retained).toHaveLength(2);
    expect(retained.every((playlist) => playlist.account === null && playlist.enabled)).toBe(true);
    expect((await records.get({ ownerId, id: record.id }))?.markdown).toBe('Saved captions');
  } finally {
    await db.close();
  }
});

test('account ownership and selection failures cannot mutate another owner or partially import playlists', async () => {
  const db = await testDatabase();
  const repository = new SqliteAccountsRepository(db);
  const playlists = new SqlitePlaylistsRepository(db);
  let current = source;
  const service = new AccountsService(
    repository,
    playlists,
    { list: () => Promise.resolve(current) },
    { wake() {} },
  );
  const signal = new AbortController().signal;
  try {
    const { id } = await service.create({ ownerId: 'alice', url: '@example' }, signal);
    const bob = await service.create({ ownerId: 'bob', url: '@example' }, signal);
    expect(bob.id).not.toBe(id);
    const foreign = { ownerId: 'bob', id };
    await expect(service.get(foreign)).rejects.toMatchObject({ status: 404 });
    await expect(service.edit({ ...foreign, title: 'Stolen' })).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.remove(foreign)).rejects.toMatchObject({ status: 404 });
    await expect(service.discoverPlaylists(foreign, signal)).rejects.toMatchObject({ status: 404 });
    expect(
      await playlists.followAccount({ ownerId: 'bob', accountId: id, playlists: source.playlists }),
    ).toBeNull();
    await expect(
      service.follow(
        { ownerId: 'alice', id, youtubeIds: [source.playlists[0]!.youtubeId, 'PLtampered123'] },
        signal,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(await playlists.list({ ownerId: 'alice' })).toEqual([]);
    current = { ...source, youtubeId: 'UCabcdefghijklmnopqrstuv' };
    await expect(
      service.follow(
        { ownerId: 'alice', id, youtubeIds: [source.playlists[0]!.youtubeId] },
        signal,
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(await playlists.due()).toEqual([]);
    const racing = new AccountsService(
      repository,
      playlists,
      {
        list: async () => {
          await repository.remove({ ownerId: 'alice', id });
          return source;
        },
      },
      { wake() {} },
    );
    await expect(
      racing.follow({ ownerId: 'alice', id, youtubeIds: [source.playlists[0]!.youtubeId] }, signal),
    ).rejects.toMatchObject({ status: 404 });
    expect(await playlists.due()).toEqual([]);
    expect(await service.list({ ownerId: 'bob' })).toHaveLength(1);
  } finally {
    await db.close();
  }
});
