import type { SQL } from 'bun';
import {
  OWNER_USER_ID,
  type OwnerRegistrationPersistenceState,
} from '#lib/auth/owner-registration.ts';
export interface OwnerRegistrationRepository {
  state(): Promise<OwnerRegistrationPersistenceState>;
}
export class SqliteOwnerRegistrationRepository implements OwnerRegistrationRepository {
  constructor(private readonly db: SQL) {}
  async state() {
    const [row] = await this
      .db`SELECT EXISTS(SELECT 1 FROM auth_user WHERE id=${OWNER_USER_ID}) AS owner, EXISTS(SELECT 1 FROM auth_passkey WHERE userId=${OWNER_USER_ID}) AS passkey`;
    return { ownerExists: Boolean(row.owner), passkeyExists: Boolean(row.passkey) };
  }
}
