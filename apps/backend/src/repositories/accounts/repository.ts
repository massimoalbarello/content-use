import type { SQL } from 'bun';
import type { Account } from '#models/accounts.ts';
import type { Actor } from '#models/records.ts';

export interface AccountsRepository {
  list(input: Actor & { id?: string }): Promise<Account[]>;
  create(input: Actor & { youtubeId: string; url: string; title: string }): Promise<string>;
  edit(input: Actor & { id: string; title: string }): Promise<boolean>;
  remove(input: Actor & { id: string }): Promise<boolean>;
}

export class SqliteAccountsRepository implements AccountsRepository {
  constructor(private readonly db: SQL) {}

  list({ ownerId, id }: Actor & { id?: string }): Promise<Account[]> {
    return this.db`SELECT id,owner_id AS ownerId,youtube_id AS youtubeId,url,title FROM accounts
      WHERE owner_id=${ownerId} AND (${id ?? null} IS NULL OR id=${id ?? null}) ORDER BY title,id`;
  }
  async create(input: Actor & { youtubeId: string; url: string; title: string }) {
    const [row] = await this.db`INSERT INTO accounts(id,owner_id,youtube_id,url,title)
      VALUES(${`acc-${crypto.randomUUID()}`},${input.ownerId},${input.youtubeId},${input.url},${input.title})
      ON CONFLICT(owner_id,youtube_id) DO UPDATE SET url=excluded.url RETURNING id`;
    return row.id as string;
  }
  async edit(input: Actor & { id: string; title: string }) {
    const rows = await this
      .db`UPDATE accounts SET title=${input.title} WHERE id=${input.id} AND owner_id=${input.ownerId} RETURNING id`;
    return rows.length > 0;
  }
  async remove(input: Actor & { id: string }) {
    const rows = await this
      .db`DELETE FROM accounts WHERE id=${input.id} AND owner_id=${input.ownerId} RETURNING id`;
    return rows.length > 0;
  }
}
