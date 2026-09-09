import type { SQL } from 'bun';
import type {
  Actor,
  ContentRecord,
  PlaylistLink,
  RecordFilter,
  RecordStatus,
} from '#models/records.ts';

export type RecordListInput = Actor & {
  search: string;
  offset: number;
  status?: RecordFilter;
  playlistId?: string;
};

type Row = {
  id: string;
  owner_id: string;
  title: string;
  url: string;
  markdown: string;
  status: RecordStatus;
  progress: string;
  error: string | null;
  media_name: string | null;
  media_type: 'audio' | 'video' | null;
  duration: number | null;
  created_at: string;
  updated_at: string;
};
function map(row: Row): ContentRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    url: row.url,
    markdown: row.markdown,
    status: row.status,
    progress: row.progress,
    error: row.error,
    mediaName: row.media_name,
    mediaType: row.media_type,
    duration: row.duration,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
export interface RecordsRepository {
  list(input: RecordListInput): Promise<{ records: ContentRecord[]; total: number }>;
  playlistLinks(input: Actor & { ids: string[] }): Promise<Map<string, PlaylistLink[]>>;
  get(input: Actor & { id: string }): Promise<ContentRecord | null>;
  create(input: Actor & { id: string; title: string; url: string }): Promise<ContentRecord>;
  edit(
    input: Actor & { id: string; title: string; markdown: string },
  ): Promise<ContentRecord | null>;
  remove(input: Actor & { id: string }): Promise<void>;
  retry(input: Actor & { id: string }): Promise<void>;
  recover(): Promise<void>;
  claim(): Promise<ContentRecord | null>;
  progress(
    input: Actor & { id: string; status: RecordStatus; progress: string; error?: string | null },
  ): Promise<void>;
  media(
    input: Actor & {
      id: string;
      title: string;
      name: string;
      type: 'audio' | 'video';
      duration: number | null;
    },
  ): Promise<void>;
  saveCaptions(
    input: Actor & { id: string; markdown: string; title: string; duration: number | null },
  ): Promise<void>;
  chunk(input: Actor & { id: string; index: number }): Promise<string | null>;
  saveChunk(input: Actor & { id: string; index: number; text: string }): Promise<void>;
  finish(input: Actor & { id: string; markdown: string }): Promise<void>;
}
export class SqliteRecordsRepository implements RecordsRepository {
  constructor(private readonly db: SQL) {}
  async list({ ownerId, search, offset, status = 'all', playlistId }: RecordListInput) {
    const match = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    const rows: Row[] = await this.db`SELECT * FROM records WHERE owner_id=${ownerId}
      AND (${status}='all' OR status=${status} OR (${status}='processing' AND status IN ('downloading','transcribing')))
      AND (${playlistId ?? null} IS NULL OR EXISTS(SELECT 1 FROM playlist_videos v JOIN playlists p ON p.id=v.playlist_id WHERE v.record_id=records.id AND p.owner_id=${ownerId} AND p.id=${playlistId ?? null}))
      AND (title LIKE ${match} ESCAPE '\\' OR url LIKE ${match} ESCAPE '\\' OR markdown LIKE ${match} ESCAPE '\\') ORDER BY created_at DESC, id DESC LIMIT 50 OFFSET ${offset}`;
    const [count] = await this.db`SELECT count(*) AS total FROM records WHERE owner_id=${ownerId}
      AND (${status}='all' OR status=${status} OR (${status}='processing' AND status IN ('downloading','transcribing')))
      AND (${playlistId ?? null} IS NULL OR EXISTS(SELECT 1 FROM playlist_videos v JOIN playlists p ON p.id=v.playlist_id WHERE v.record_id=records.id AND p.owner_id=${ownerId} AND p.id=${playlistId ?? null}))
      AND (title LIKE ${match} ESCAPE '\\' OR url LIKE ${match} ESCAPE '\\' OR markdown LIKE ${match} ESCAPE '\\')`;
    return { records: rows.map(map), total: Number(count.total) };
  }
  async playlistLinks({ ownerId, ids }: Actor & { ids: string[] }) {
    const links = new Map<string, PlaylistLink[]>();
    if (!ids.length) {
      return links;
    }
    const rows: { record_id: string; id: string; title: string }[] = await this.db`
      SELECT v.record_id,p.id,p.title FROM playlist_videos v
      JOIN playlists p ON p.id=v.playlist_id JOIN records r ON r.id=v.record_id
      WHERE p.owner_id=${ownerId} AND r.owner_id=${ownerId}
      AND r.id IN (SELECT value FROM json_each(${JSON.stringify(ids)})) ORDER BY p.title,p.id`;
    for (const row of rows) {
      const values = links.get(row.record_id) ?? [];
      values.push({ id: row.id, title: row.title });
      links.set(row.record_id, values);
    }
    return links;
  }
  async get({ ownerId, id }: Actor & { id: string }) {
    const [row]: Row[] = await this
      .db`SELECT * FROM records WHERE owner_id=${ownerId} AND id=${id}`;
    return row ? map(row) : null;
  }
  async create({ ownerId, id, title, url }: Actor & { id: string; title: string; url: string }) {
    const now = new Date().toISOString();
    const [row]: Row[] = await this
      .db`INSERT INTO records (id,owner_id,title,url,status,created_at,updated_at) VALUES (${id},${ownerId},${title},${url},'queued',${now},${now}) RETURNING *`;
    return map(row!);
  }
  async edit({
    ownerId,
    id,
    title,
    markdown,
  }: Actor & { id: string; title: string; markdown: string }) {
    const [row]: Row[] = await this
      .db`UPDATE records SET title=${title},markdown=${markdown},updated_at=${new Date().toISOString()} WHERE owner_id=${ownerId} AND id=${id} AND status IN ('ready','failed') RETURNING *`;
    return row ? map(row) : null;
  }
  async remove({ ownerId, id }: Actor & { id: string }) {
    await this.db`DELETE FROM records WHERE owner_id=${ownerId} AND id=${id}`;
  }
  async retry({ ownerId, id }: Actor & { id: string }) {
    await this
      .db`UPDATE records SET status='queued',error=NULL,progress='Waiting to retry',job_generation=job_generation+1,attempts=0,next_attempt_at=NULL,updated_at=${new Date().toISOString()} WHERE owner_id=${ownerId} AND id=${id} AND (status='failed' OR (status='ready' AND error IS NOT NULL))`;
  }
  async recover() {
    await this
      .db`UPDATE records SET status='queued',progress='Resuming after restart' WHERE status IN ('downloading','transcribing')`;
  }
  async claim() {
    const [row]: Row[] = await this
      .db`UPDATE records SET status='downloading',progress='Preparing download' WHERE id=(SELECT id FROM records WHERE status='queued' ORDER BY created_at LIMIT 1) AND status='queued' RETURNING *`;
    return row ? map(row) : null;
  }
  async progress({
    ownerId,
    id,
    status,
    progress,
    error,
  }: Actor & { id: string; status: RecordStatus; progress: string; error?: string | null }) {
    await this
      .db`UPDATE records SET status=${status},progress=${progress},error=${error ?? null},updated_at=${new Date().toISOString()} WHERE owner_id=${ownerId} AND id=${id}`;
  }
  async media({
    ownerId,
    id,
    title,
    name,
    type,
    duration,
  }: Actor & {
    id: string;
    title: string;
    name: string;
    type: 'audio' | 'video';
    duration: number | null;
  }) {
    await this
      .db`UPDATE records SET title=CASE WHEN title=url THEN ${title} ELSE title END,media_name=${name},media_type=${type},duration=COALESCE(${duration},duration),updated_at=${new Date().toISOString()} WHERE owner_id=${ownerId} AND id=${id}`;
  }
  async saveCaptions({
    ownerId,
    id,
    markdown,
    title,
    duration,
  }: Actor & { id: string; markdown: string; title: string; duration: number | null }) {
    await this
      .db`UPDATE records SET markdown=${markdown},title=CASE WHEN title=url THEN ${title} ELSE title END,duration=COALESCE(${duration},duration),updated_at=${new Date().toISOString()} WHERE owner_id=${ownerId} AND id=${id}`;
  }
  async chunk({ ownerId, id, index }: Actor & { id: string; index: number }) {
    const [row] = await this
      .db`SELECT text FROM transcript_chunks WHERE record_id=${id} AND chunk_index=${index} AND EXISTS(SELECT 1 FROM records WHERE id=${id} AND owner_id=${ownerId})`;
    return row?.text ?? null;
  }
  async saveChunk({
    ownerId,
    id,
    index,
    text,
  }: Actor & { id: string; index: number; text: string }) {
    await this
      .db`INSERT INTO transcript_chunks (record_id,chunk_index,text) SELECT ${id},${index},${text} WHERE EXISTS(SELECT 1 FROM records WHERE id=${id} AND owner_id=${ownerId}) ON CONFLICT(record_id,chunk_index) DO UPDATE SET text=excluded.text`;
  }
  async finish({ ownerId, id, markdown }: Actor & { id: string; markdown: string }) {
    await this
      .db`UPDATE records SET markdown=${markdown},status='ready',progress='Captions ready',error=NULL,updated_at=${new Date().toISOString()} WHERE owner_id=${ownerId} AND id=${id}`;
  }
}
