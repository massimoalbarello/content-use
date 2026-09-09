import { youtubeEmbed } from '#models/records.ts';
import { type CaptionResult, parseCaptions } from './captions';

export interface CaptionQuota {
  reserve(now?: number): Promise<number>;
  observe(headers: Headers, status: number, dailyCap: boolean, now?: number): Promise<number>;
}

type Fetcher = (url: URL, init: RequestInit) => Promise<Response>;
type JsonObject = Record<string, unknown>;
const errors: Record<number, string> = {
  401: 'The caption service credential is invalid. Contact the app administrator.',
  402: 'The caption service has no credits remaining. Contact the app administrator.',
  429: 'The caption service is temporarily at its request limit. Please retry later.',
};
export class CaptionServiceError extends Error {
  constructor(
    message: string,
    public readonly retryAt: number | null,
    public readonly permanent = false,
  ) {
    super(message);
  }
}
export class HostedCaptions {
  constructor(
    private readonly apiKey?: string,
    private readonly fetcher: Fetcher = fetch,
    private readonly quota?: CaptionQuota,
  ) {}
  async fetch(url: string, parentSignal: AbortSignal): Promise<CaptionResult> {
    const embed = youtubeEmbed(url);
    if (!embed) {
      throw new Error('Hosted caption retrieval only accepts YouTube videos.');
    }
    const retryAt = await this.quota?.reserve();
    if (retryAt) {
      throw new CaptionServiceError('Waiting for the caption service limit to reset.', retryAt);
    }
    const target = new URL('https://api.freetranscriptapi.com/v1/transcript');
    target.searchParams.set('video_url', embed.split('/').at(-1)!);
    const headers = new Headers({ Accept: 'application/json' });
    if (this.apiKey) {
      headers.set('Authorization', `Bearer ${this.apiKey}`);
    }
    const response = await this.fetcher(target, {
      headers,
      redirect: 'error',
      signal: AbortSignal.any([parentSignal, AbortSignal.timeout(60000)]),
    });
    let errorBody: JsonObject = {};
    if (!response.ok) {
      try {
        errorBody = await boundedJson(response);
      } catch {}
    }
    const errorCode = (errorBody.error as JsonObject | undefined)?.code;
    const dailyCap = errorCode === 'anonymous_daily_cap_exceeded';
    const blockedUntil = await this.quota?.observe(response.headers, response.status, dailyCap);
    if (response.status === 404 && errorCode === 'video_not_found') {
      return { title: url, markdown: '', duration: null };
    }
    if (!response.ok) {
      throw serviceError(response.status, blockedUntil);
    }
    const result = await boundedJson(response);
    if (typeof result.title !== 'string' || !result.title.trim()) {
      throw new Error('The caption service returned invalid video metadata.');
    }
    return {
      title: result.title.slice(0, 300),
      markdown: captionMarkdown(result.transcript),
      duration: null,
    };
  }
}
function serviceError(status: number, blockedUntil?: number): CaptionServiceError {
  return new CaptionServiceError(
    errors[status] ?? `Caption service returned HTTP ${status}. Please retry.`,
    status === 429 ? blockedUntil || Date.now() + 3600000 : null,
    status >= 400 && status < 500 && ![408, 429].includes(status),
  );
}
async function boundedJson(response: Response): Promise<JsonObject> {
  if (!response.body) {
    throw new Error('The caption service returned an empty response.');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > 2000000) {
        throw new Error('The caption response exceeds the 2 MB limit.');
      }
      chunks.push(value);
    }
    const data: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('The caption service returned an invalid response.');
    }
    return data as JsonObject;
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
function captionMarkdown(content: unknown): string {
  if (!Array.isArray(content)) {
    throw new Error('The caption service returned an invalid transcript.');
  }
  const events = content.map((segment: unknown) => {
    if (!segment || typeof segment !== 'object') {
      throw new Error('Invalid caption segment.');
    }
    const { text, start, duration } = segment as JsonObject;
    if (
      typeof text !== 'string' ||
      typeof start !== 'number' ||
      typeof duration !== 'number' ||
      !Number.isFinite(start) ||
      !Number.isFinite(duration) ||
      start < 0 ||
      duration < 0
    ) {
      throw new Error('Invalid caption segment.');
    }
    if (start + duration > 10800) {
      throw new Error('This video exceeds the 3 hour limit.');
    }
    return { tStartMs: start * 1000, dDurationMs: duration * 1000, segs: [{ utf8: text }] };
  });
  return events.length ? parseCaptions(JSON.stringify({ events }), 'json3') : '';
}
