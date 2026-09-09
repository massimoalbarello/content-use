import { expect, test } from 'bun:test';
import { parseCaptions, selectCaption } from '../../../src/lib/media/captions';
import { youtubeEmbed } from '../../../src/models/records';

test('selects published captions before auto, original language before translations, and excludes chat', () => {
  expect(
    selectCaption({
      language: 'en-US',
      subtitles: { live_chat: [{ ext: 'json3' }], fr: [{ ext: 'vtt' }] },
      automatic_captions: { 'en-orig': [{ ext: 'json3' }] },
    }),
  ).toEqual({ language: 'fr', automatic: false });
  expect(
    selectCaption({
      language: 'en-US',
      automatic_captions: { de: [{ ext: 'json3' }], 'en-orig': [{ ext: 'json3' }] },
    }),
  ).toEqual({ language: 'en-orig', automatic: true });
  expect(selectCaption({ subtitles: { live_chat: [{ ext: 'json3' }] } })).toBeNull();
});
test('JSON3 joins word segments, ignores window events, preserves repeated speech and escapes Markdown', () => {
  expect(
    parseCaptions(
      JSON.stringify({
        events: [
          { wWinId: 1 },
          { tStartMs: 0, dDurationMs: 3000, segs: [{ utf8: 'Yes, yes.' }] },
          { tStartMs: 1000, segs: [{ utf8: '\n' }] },
          { tStartMs: 1500, segs: [{ utf8: 'Yes, yes.' }, { utf8: ' A &amp; B *test*' }] },
        ],
      }),
      'json3',
    ),
  ).toBe('Yes, yes. Yes, yes. A & B \\*test\\*');
  expect(() => parseCaptions('{}', 'json3')).toThrow('invalid');
  expect(() => parseCaptions('WEBVTT\n\n', 'vtt')).toThrow('invalid');
});
test('VTT deduplicates rolling captions only while cues overlap; SRT preserves later repetition', () => {
  expect(
    parseCaptions(
      'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello world\n\n00:00:01.500 --> 00:00:03.000\nHello world again\n\n00:00:05.000 --> 00:00:06.000\nHello world again\n',
      'vtt',
    ),
  ).toBe('Hello world again Hello world again');
  expect(
    parseCaptions('1\n00:00:00,000 --> 00:00:01,000\n<b>Hello</b> &amp; goodbye\n', 'srt'),
  ).toBe('Hello & goodbye');
});
test('only real YouTube hosts and IDs can create iframe URLs', () => {
  expect(youtubeEmbed('https://www.youtube.com/watch?v=rY0wnfFHYbs')).toBe(
    'https://www.youtube-nocookie.com/embed/rY0wnfFHYbs',
  );
  expect(youtubeEmbed('https://youtube.com.attacker.com/watch?v=rY0wnfFHYbs')).toBeNull();
  expect(youtubeEmbed('https://youtu.be/invalid')).toBeNull();
});
