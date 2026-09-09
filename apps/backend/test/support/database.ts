import { SQL } from 'bun';
import { migrate } from '../../src/db/migrate';
export async function testDatabase() {
  const db = new SQL({ adapter: 'sqlite', filename: ':memory:' });
  await db.unsafe('PRAGMA foreign_keys=ON');
  await migrate(db);
  for (const id of ['alice', 'bob']) {
    await db`INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES (${id},${id},${`${id}@example.com`},1,${new Date().toISOString()},${new Date().toISOString()})`;
  }
  return db;
}
