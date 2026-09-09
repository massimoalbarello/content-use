import type { SQL } from 'bun';
export type SecretKind = 'client' | 'tokens';
export type Summary = { text: string; model: string; createdAt: string };
export interface UtilintRepository {
  readClient(): Promise<string | null>;
  saveClientIfAbsent(encrypted: string): Promise<void>;
  read(ownerId: string, kind: SecretKind): Promise<string | null>;
  write(ownerId: string, kind: SecretKind, encrypted: string): Promise<void>;
  remove(ownerId: string, kind: SecretKind): Promise<void>;
  summary(ownerId: string, recordId: string, hash: string): Promise<Summary | null>;
  saveSummary(ownerId: string, recordId: string, hash: string, summary: Summary): Promise<void>;
}
export class SqliteUtilintRepository implements UtilintRepository {
  constructor(private readonly db: SQL) {}
  async readClient() {
    const [row] = await this.db`SELECT encrypted FROM utilint_client WHERE id=1`;
    return row?.encrypted ?? null;
  }
  async saveClientIfAbsent(encrypted: string) {
    await this
      .db`INSERT INTO utilint_client(id,encrypted) VALUES(1,${encrypted}) ON CONFLICT(id) DO NOTHING`;
  }
  async read(ownerId: string, kind: SecretKind) {
    const [row] = await this
      .db`SELECT encrypted FROM utilint_secrets WHERE owner_id=${ownerId} AND kind=${kind}`;
    return row?.encrypted ?? null;
  }
  async write(ownerId: string, kind: SecretKind, encrypted: string) {
    await this
      .db`INSERT INTO utilint_secrets(owner_id,kind,encrypted) VALUES(${ownerId},${kind},${encrypted}) ON CONFLICT(owner_id,kind) DO UPDATE SET encrypted=excluded.encrypted`;
  }
  async remove(ownerId: string, kind: SecretKind) {
    await this.db`DELETE FROM utilint_secrets WHERE owner_id=${ownerId} AND kind=${kind}`;
  }
  async summary(ownerId: string, recordId: string, hash: string) {
    const [row] = await this
      .db`SELECT summary AS text,model,created_at AS createdAt FROM record_summaries WHERE owner_id=${ownerId} AND record_id=${recordId} AND source_hash=${hash}`;
    return (row as Summary | undefined) ?? null;
  }
  async saveSummary(ownerId: string, recordId: string, hash: string, summary: Summary) {
    await this
      .db`INSERT INTO record_summaries(record_id,owner_id,source_hash,summary,model,created_at)
      SELECT ${recordId},${ownerId},${hash},${summary.text},${summary.model},${summary.createdAt}
      WHERE EXISTS(SELECT 1 FROM records WHERE id=${recordId} AND owner_id=${ownerId})
      ON CONFLICT(record_id) DO UPDATE SET source_hash=excluded.source_hash,summary=excluded.summary,model=excluded.model,created_at=excluded.created_at WHERE record_summaries.owner_id=${ownerId}`;
  }
}
