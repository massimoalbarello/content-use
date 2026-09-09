import { decodeHTML } from 'entities';
import { parseSync } from 'subtitle';
import { DomainError } from '#models/records.ts';

export type CaptionResult = { markdown: string; title: string; duration: number | null };
type Track = { ext?: string };
export function selectCaption(info: {
  language?: string;
  subtitles?: Record<string, Track[]>;
  automatic_captions?: Record<string, Track[]>;
}) {
  const language = info.language?.split('-')[0];
  for (const [automatic, tracks] of [
    [false, info.subtitles],
    [true, info.automatic_captions],
  ] as const) {
    const keys = Object.keys(tracks ?? {}).filter(
      (key) =>
        key !== 'live_chat' &&
        tracks?.[key]?.some((track) => ['json3', 'vtt', 'srt'].includes(track.ext ?? '')),
    );
    const key =
      keys.find((key) => key === `${language}-orig`) ??
      keys.find((key) => key.endsWith('-orig')) ??
      keys.find((key) => key === info.language) ??
      keys.find((key) => key === language) ??
      keys.find((key) => key === 'en') ??
      keys[0];
    if (key) {
      return { language: key, automatic };
    }
  }
  return null;
}
export function parseCaptions(content: string, format: 'json3' | 'vtt' | 'srt'): string {
  if (content.length > 1800000) {
    throw new DomainError('Caption file is too large (limit: 1.8 MB).');
  }
  return captionParagraphs(readCues(content, format), format !== 'json3');
}
type Cue = { start: number; end: number; text: string };
function readCues(content: string, format: 'json3' | 'vtt' | 'srt'): Cue[] {
  let cues: Cue[];
  try {
    if (format === 'json3') {
      const data = JSON.parse(content);
      if (!Array.isArray(data.events)) {
        throw new Error('Missing events');
      }
      cues = data.events
        .filter((event: { segs?: unknown }) => Array.isArray(event.segs))
        .map((event: { tStartMs?: number; dDurationMs?: number; segs: { utf8?: string }[] }) => ({
          start: Number(event.tStartMs ?? 0),
          end: Number(event.tStartMs ?? 0) + Number(event.dDurationMs ?? 0),
          text: event.segs.map((seg) => (typeof seg.utf8 === 'string' ? seg.utf8 : '')).join(''),
        }));
    } else {
      cues = parseSync(content).flatMap((node) => (node.type === 'cue' ? [node.data] : []));
    }
    return cues;
  } catch {
    throw new DomainError('This caption file is invalid. Choose a yt-dlp JSON3, VTT, or SRT file.');
  }
}
function captionParagraphs(cues: Cue[], rolling: boolean): string {
  const paragraphs: string[] = [];
  let paragraph = '';
  let previous = { text: '', end: -1 };
  const cleaned = cues
    .map((cue) => ({
      ...cue,
      text: decodeHTML(cue.text.replace(/<[^>]*>/g, ''))
        .replace(/\s+/g, ' ')
        .trim(),
    }))
    .filter((cue) => cue.text);
  for (const cue of cleaned) {
    const text = cue.text;
    const addition =
      rolling && cue.start <= previous.end ? removeOverlap(previous.text, text) : text;
    if (addition) {
      if (paragraph && (cue.start - previous.end > 2000 || paragraph.length > 550)) {
        paragraphs.push(paragraph);
        paragraph = '';
      }
      paragraph = [paragraph, addition].filter(Boolean).join(' ');
    }
    previous = { text, end: cue.end };
  }
  if (paragraph) {
    paragraphs.push(paragraph);
  }
  if (!paragraphs.length) {
    throw new DomainError('No caption text was found in this file.');
  }
  return paragraphs.map((text) => text.replace(/([\\`*_{}[\]()#+!<>|])/g, '\\$1')).join('\n\n');
}

function removeOverlap(previous: string, text: string): string {
  const words = text.split(' ');
  const before = previous.split(' ');
  for (let n = Math.min(words.length, before.length); n > 0; n--) {
    if (before.slice(-n).join(' ') === words.slice(0, n).join(' ')) {
      return words.slice(n).join(' ');
    }
  }
  return text;
}
