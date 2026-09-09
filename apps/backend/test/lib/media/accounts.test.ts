import { expect, test } from 'bun:test';
import { parseAccount } from '../../../src/lib/media/accounts';
import { accountUrl } from '../../../src/models/accounts';

test('account inputs resolve only to YouTube channel tabs', () => {
  for (const value of [
    ' @example ',
    'https://youtube.com/@example',
    'https://m.youtube.com/@example/videos?view=0',
  ]) {
    expect(accountUrl(value)).toBe('https://www.youtube.com/@example/playlists');
  }
  expect(accountUrl('https://youtube.com/channel/UCN2hRGM8-gNDN5feecorWaQ/playlists')).toBe(
    'https://www.youtube.com/channel/UCN2hRGM8-gNDN5feecorWaQ/playlists',
  );
  expect(accountUrl('https://youtube.com/user/example')).toBe(
    'https://www.youtube.com/user/example/playlists',
  );
  for (const value of [
    'example',
    'http://youtube.com/@example',
    'https://youtube.com.evil.test/@example',
    'https://user:secret@youtube.com/@example',
    'https://youtube.com:444/@example',
    'https://youtube.com/watch?v=rY0wnfFHYbs',
    'https://youtube.com/playlist?list=PLabcdefghijk',
    '@example/../../watch',
    'https://127.0.0.1/@example',
  ]) {
    expect(() => accountUrl(value)).toThrow('Use a YouTube handle or channel URL.');
  }
});

test('account metadata keeps public supported playlists without expanding videos or duplicating entries', () => {
  const metadata = {
    _type: 'playlist',
    channel_id: 'UCN2hRGM8-gNDN5feecorWaQ',
    channel: 'Example',
    entries: [
      { id: 'PLabcdefghijk', title: 'First', url: 'https://evil.test' },
      { id: 'PLabcdefghijk', title: 'First' },
      { id: 'PL01234567890', title: 'Second' },
      { id: 'PLprivate1234', title: 'Private', availability: 'private' },
      { id: 'PLunlisted123', availability: 'unlisted' },
      { id: 'rY0wnfFHYbs', title: 'Video' },
      { id: 'RDabcdefghijk', title: 'Mix' },
      null,
    ],
  };
  const result = parseAccount(JSON.stringify(metadata));
  expect(result.playlists).toEqual([
    {
      youtubeId: 'PLabcdefghijk',
      title: 'First',
      url: 'https://www.youtube.com/playlist?list=PLabcdefghijk',
    },
    {
      youtubeId: 'PL01234567890',
      title: 'Second',
      url: 'https://www.youtube.com/playlist?list=PL01234567890',
    },
  ]);
  expect(result.url).toBe('https://www.youtube.com/channel/UCN2hRGM8-gNDN5feecorWaQ');
  expect(parseAccount(JSON.stringify({ ...metadata, entries: [] })).playlists).toEqual([]);
  expect(() => parseAccount(JSON.stringify({ ...metadata, channel_id: 'invalid' }))).toThrow(
    'public account',
  );
  expect(() =>
    parseAccount(JSON.stringify({ ...metadata, entries: Array(1001).fill(null) })),
  ).toThrow('1,000 playlist limit');
});
