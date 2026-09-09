import { expect, test } from 'bun:test';
import { parsePlaylist } from '../../../src/lib/media/playlists';

test('flat playlist metadata preserves real durations and leaves unknown or invalid durations unset', () => {
  const parsed = parsePlaylist(
    JSON.stringify({
      _type: 'playlist',
      title: 'Talks',
      entries: [
        { id: 'rY0wnfFHYbs', title: 'Known', duration: 731.5 },
        { id: 'aircAruvnKk', title: 'Unknown' },
        { id: 'dQw4w9WgXcQ', title: 'Invalid', duration: -1 },
        { id: 'aaaaaaaaaaa', title: 'Text', duration: '3:20' },
        { id: 'bbbbbbbbbbb', title: '[Private video]', duration: 60 },
      ],
    }),
  );
  expect(parsed.videos.map((video) => video.duration)).toEqual([731.5, null, null, null]);
});
