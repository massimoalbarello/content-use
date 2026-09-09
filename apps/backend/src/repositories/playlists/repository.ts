import type { SQL } from 'bun';
import type { Playlist, PlaylistPoll, PlaylistVideo } from '#models/playlists.ts';
import { type Actor, mediaDuration, youtubeVideoId } from '#models/records.ts';
export interface PlaylistsRepository {
  list(input: Actor & { id?: string }): Promise<Playlist[]>;
  beginPoll(input: Actor & { id: string; pollId: string }): Promise<boolean>;
  create(input: Actor & { youtubeId: string; url: string; title: string }): Promise<string>;
  setEnabled(input: Actor & { id: string; enabled: boolean }): Promise<boolean>;
  due(now?: string): Promise<(Actor & { id: string; url: string; nextCheckAt: string })[]>;
  sync(
    input: Actor & { id: string; title: string; videos: PlaylistVideo[]; pollId?: string },
  ): Promise<void>;
  failure(input: Actor & { id: string; error: string; pollId?: string }): Promise<void>;
}
export class SqlitePlaylistsRepository implements PlaylistsRepository {
  constructor(private readonly db: SQL) {}
  async list({ ownerId, id }: Actor & { id?: string }): Promise<Playlist[]> {
    const rows: {
      id: string;
      owner_id: string;
      youtube_id: string;
      url: string;
      title: string;
      enabled: number;
      checked_at: string | null;
      next_check_at: string;
      error: string | null;
      video_count: number;
      ready_count: number;
      pending_count: number;
      failed_count: number;
      active_count: number;
      retry_at: string | null;
    }[] = await this.db`SELECT p.*, count(v.record_id) AS video_count,
      sum(CASE WHEN r.status='ready' THEN 1 ELSE 0 END) AS ready_count,
      sum(CASE WHEN r.status IN ('queued','downloading','transcribing') THEN 1 ELSE 0 END) AS pending_count,
      sum(CASE WHEN r.status='failed' THEN 1 ELSE 0 END) AS failed_count,
      sum(CASE WHEN r.status IN ('downloading','transcribing') THEN 1 ELSE 0 END) AS active_count,
      min(CASE WHEN r.status='queued' THEN r.next_attempt_at END) AS retry_at
      FROM playlists p LEFT JOIN playlist_videos v ON v.playlist_id=p.id
      LEFT JOIN records r ON r.id=v.record_id AND r.owner_id=p.owner_id
      WHERE p.owner_id=${ownerId} AND (${id ?? null} IS NULL OR p.id=${id ?? null}) GROUP BY p.id ORDER BY p.title,p.id`;
    const history = await this.pollHistory(ownerId, id);
    return rows.map((r) => ({
      id: r.id,
      ownerId: r.owner_id,
      youtubeId: r.youtube_id,
      url: r.url,
      title: r.title,
      enabled: !!r.enabled,
      checkedAt: r.checked_at,
      nextCheckAt: r.next_check_at,
      error: r.error,
      videoCount: Number(r.video_count),
      readyCount: Number(r.ready_count),
      pendingCount: Number(r.pending_count),
      failedCount: Number(r.failed_count),
      activeCount: Number(r.active_count),
      retryAt: r.retry_at,
      polls: history.get(r.id) ?? [],
    }));
  }
  private async pollHistory(ownerId: string, id?: string) {
    const rows: PollRow[] = await this.db`WITH recent AS (
      SELECT poll.*,row_number() OVER(PARTITION BY poll.playlist_id ORDER BY poll.started_at DESC,poll.id DESC) AS rank
      FROM playlist_polls poll JOIN playlists p ON p.id=poll.playlist_id WHERE p.owner_id=${ownerId} AND (${id ?? null} IS NULL OR p.id=${id ?? null})
    ) SELECT * FROM recent WHERE rank<=10 ORDER BY started_at DESC,id DESC`;
    const history = new Map<string, PlaylistPoll[]>();
    for (const row of rows) {
      const polls = history.get(row.playlist_id) ?? [];
      polls.push({
        id: row.id,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        status: row.status,
        attempts: row.attempts,
        scannedCount: row.scanned_count,
        addedCount: row.added_count,
        linkedCount: row.linked_count,
        error: row.error,
      });
      history.set(row.playlist_id, polls);
    }
    return history;
  }
  async beginPoll(input: Actor & { id: string; pollId: string }) {
    const rows = await this.db`INSERT INTO playlist_polls(id,playlist_id,started_at,status)
      SELECT ${input.pollId},id,${new Date().toISOString()},'checking' FROM playlists WHERE id=${input.id} AND owner_id=${input.ownerId} AND enabled=1
      ON CONFLICT(id) DO UPDATE SET attempts=attempts+1 WHERE playlist_id=excluded.playlist_id AND status='checking' RETURNING id`;
    return rows.length > 0;
  }
  async create(input: Actor & { youtubeId: string; url: string; title: string }) {
    const id = `pl-${crypto.randomUUID()}`;
    const [row] = await this
      .db`INSERT INTO playlists(id,owner_id,youtube_id,url,title,next_check_at)
      VALUES(${id},${input.ownerId},${input.youtubeId},${input.url},${input.title},${new Date().toISOString()})
      ON CONFLICT(owner_id,youtube_id) DO UPDATE SET enabled=1,next_check_at=excluded.next_check_at RETURNING id`;
    return row.id as string;
  }
  setEnabled(input: Actor & { id: string; enabled: boolean }) {
    return this.db.begin(async (tx) => {
      const rows =
        await tx`UPDATE playlists SET enabled=${Number(input.enabled)},next_check_at=${new Date().toISOString()} WHERE id=${input.id} AND owner_id=${input.ownerId} RETURNING id`;
      if (rows.length && !input.enabled) {
        await tx`UPDATE playlist_polls SET status='cancelled',finished_at=${new Date().toISOString()} WHERE playlist_id=${input.id} AND status='checking'`;
      }
      return rows.length > 0;
    });
  }

  due(now = new Date().toISOString()) {
    return this
      .db`SELECT id,owner_id AS ownerId,url,next_check_at AS nextCheckAt FROM playlists WHERE enabled=1 AND next_check_at<=${now} ORDER BY next_check_at LIMIT 100` as Promise<
      (Actor & { id: string; url: string; nextCheckAt: string })[]
    >;
  }
  async sync(
    input: Actor & { id: string; title: string; videos: PlaylistVideo[]; pollId?: string },
  ) {
    await this.db.begin(async (tx) => {
      const [playlist] =
        await tx`SELECT * FROM playlists WHERE id=${input.id} AND owner_id=${input.ownerId} AND enabled=1`;
      if (!playlist) {
        return;
      }
      if (input.pollId) {
        const [poll] =
          await tx`SELECT status FROM playlist_polls WHERE id=${input.pollId} AND playlist_id=${input.id}`;
        if (poll?.status !== 'checking') {
          return;
        }
      }
      const now = new Date().toISOString();
      const { added, linked } = await syncVideos(tx, input, now);
      if (input.pollId) {
        await tx`UPDATE playlist_polls SET status='succeeded',finished_at=${now},scanned_count=${new Set(input.videos.map((video) => video.id)).size},added_count=${added},linked_count=${linked},error=NULL WHERE id=${input.pollId} AND playlist_id=${input.id}`;
      }
      await tx`UPDATE playlists SET title=CASE WHEN title=url THEN ${input.title} ELSE title END,checked_at=${now},next_check_at=${new Date(Date.now() + 3600000).toISOString()},error=NULL WHERE id=${input.id} AND owner_id=${input.ownerId}`;
    });
  }
  async failure(input: Actor & { id: string; error: string; pollId?: string }) {
    await this.db.begin(async (tx) => {
      if (input.pollId) {
        const [poll] =
          await tx`SELECT poll.status FROM playlist_polls poll JOIN playlists p ON p.id=poll.playlist_id WHERE poll.id=${input.pollId} AND p.id=${input.id} AND p.owner_id=${input.ownerId}`;
        if (poll?.status !== 'checking') {
          return;
        }
      }

      const rows =
        await tx`UPDATE playlists SET error=${input.error.slice(0, 500)},next_check_at=${new Date(Date.now() + 15 * 60000).toISOString()} WHERE id=${input.id} AND owner_id=${input.ownerId} AND enabled=1 RETURNING id`;
      if (rows.length && input.pollId) {
        await tx`UPDATE playlist_polls SET status='failed',finished_at=${new Date().toISOString()},error=${input.error.slice(0, 500)} WHERE id=${input.pollId} AND playlist_id=${input.id} AND status='checking'`;
      }
    });
  }
}
type PollRow = {
  id: string;
  playlist_id: string;
  started_at: string;
  finished_at: string | null;
  status: PlaylistPoll['status'];
  attempts: number;
  scanned_count: number | null;
  added_count: number | null;
  linked_count: number | null;
  error: string | null;
};

async function syncVideos(
  tx: SQL,
  input: Actor & { id: string; videos: PlaylistVideo[] },
  now: string,
) {
  // Reuse existing individually imported videos, including alternate YouTube URL forms.
  const existing = await tx`SELECT id,url FROM records WHERE owner_id=${input.ownerId}`;
  const byVideo = new Map<string, string>();
  for (const record of existing) {
    const video = youtubeVideoId(record.url);
    if (video) {
      byVideo.set(video, record.id);
    }
  }
  const memberships: { video_id: string; record_id: string | null }[] =
    await tx`SELECT video_id,record_id FROM playlist_videos WHERE playlist_id=${input.id}`;
  const seen = new Map(memberships.map((row) => [row.video_id, row.record_id]));
  let added = 0,
    linked = 0;
  for (const video of input.videos) {
    const duration = mediaDuration(video.duration);
    if (seen.has(video.id)) {
      await fillMissingDuration(tx, input.ownerId, seen.get(video.id), duration, now);
      continue;
    }
    let recordId = byVideo.get(video.id);
    if (!recordId) {
      added++;
      recordId = `rec-${crypto.randomUUID()}`;
      await tx`INSERT INTO records(id,owner_id,title,url,status,duration,created_at,updated_at) VALUES(${recordId},${input.ownerId},${video.title},${`https://www.youtube.com/watch?v=${video.id}`},'queued',${duration},${now},${now})`;
      byVideo.set(video.id, recordId);
    } else {
      linked++;
      await fillMissingDuration(tx, input.ownerId, recordId, duration, now);
    }
    await tx`INSERT INTO playlist_videos(playlist_id,video_id,record_id) VALUES(${input.id},${video.id},${recordId})`;
    seen.set(video.id, recordId);
  }

  return { added, linked };
}

async function fillMissingDuration(
  tx: SQL,
  ownerId: string,
  recordId: string | null | undefined,
  duration: number | null,
  now: string,
) {
  if (recordId && duration !== null) {
    await tx`UPDATE records SET duration=${duration},updated_at=${now} WHERE id=${recordId} AND owner_id=${ownerId} AND duration IS NULL`;
  }
}
