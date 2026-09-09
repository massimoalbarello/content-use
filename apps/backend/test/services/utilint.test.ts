import { expect, test } from 'bun:test';
import { createUtilintVault } from '../../src/lib/utilint-vault';
import { SqliteRecordsRepository } from '../../src/repositories/records/repository';
import { SqliteUtilintRepository } from '../../src/repositories/utilint/repository';
import { createUtilintService } from '../../src/services/utilint/service';
import { testDatabase } from '../support/database';

async function fixture() {
  const db = await testDatabase();
  const repository = new SqliteUtilintRepository(db);
  const records = new SqliteRecordsRepository(db);
  const vault = createUtilintVault(crypto.randomUUID().repeat(2));
  const state = {
    now: Date.now(),
    exchanges: 0,
    refreshes: 0,
    calls: 0,
    revoked: false,
    badScope: false,
    onGenerate: async () => {},
  };
  const external = (async (url, init) => {
    const target = String(url);
    if (target === 'https://utilint.example/api/auth/oauth2/token') {
      expect(
        atob(new Headers(init?.headers).get('authorization')!.slice(6))
          .split(':')
          .map(decodeURIComponent),
      ).toEqual(['client', 'client-secret']);
      const body = new URLSearchParams(String(init?.body));
      if (body.get('grant_type') === 'refresh_token') {
        state.refreshes++;
      } else {
        state.exchanges++;
        expect(body.get('code_verifier')?.length).toBeGreaterThanOrEqual(43);
      }
      return Response.json({
        access_token: `private-access-${state.refreshes}`,
        refresh_token: `private-refresh-${state.refreshes}`,
        expires_in: 900,
        token_type: 'Bearer',
        scope: state.badScope ? 'profile' : 'profile ai:invoke',
      });
    }
    expect(target.startsWith('https://utilint.example/v1/')).toBe(true);
    expect(init?.redirect).toBe('error');
    if (state.revoked) {
      return new Response(null, { status: 401 });
    }
    if (target.endsWith('/models')) {
      return Response.json({ data: [{ id: 'gpt-test' }] });
    }
    state.calls++;
    await state.onGenerate();
    expect(JSON.parse(String(init?.body)).messages[1].content).toBe('Transcript source');
    return Response.json({ choices: [{ message: { content: 'A faithful summary.' } }] });
  }) as typeof fetch;
  const service = createUtilintService({
    repository,
    records,
    vault,
    origin: 'https://content.example',
    transport: external,
    now: () => state.now,
  });
  const actor = { ownerId: 'alice', sessionId: 'session-a' };
  await service.configure('alice', {
    origin: 'https://utilint.example',
    clientId: 'client',
    clientSecret: 'client-secret',
  });
  await records.create({
    ownerId: 'alice',
    id: 'rec-test',
    title: 'Record',
    url: 'https://example.com/video',
  });
  await records.finish({ ownerId: 'alice', id: 'rec-test', markdown: 'Transcript source' });
  async function begin() {
    const { url } = await service.begin(actor, 'rec-test');
    const callback = new URL('https://content.example/api/utilint/callback');
    callback.search = new URLSearchParams({
      state: new URL(url).searchParams.get('state') ?? '',
      code: 'one-use-code',
      iss: 'https://utilint.example/api/auth',
    }).toString();
    return callback;
  }
  return { db, repository, records, vault, service, state, actor, begin };
}

test('OAuth callback binds state to owner/session, enforces expiry, issuer, scope and single use', async () => {
  const f = await fixture();
  try {
    const callback = await f.begin();
    await expect(
      f.service.complete({ ownerId: 'bob', sessionId: 'session-a' }, callback),
    ).rejects.toThrow('expired');
    await expect(
      f.service.complete({ ownerId: 'alice', sessionId: 'session-b' }, callback),
    ).rejects.toThrow('expired');
    expect(f.state.exchanges).toBe(0);
    expect(await f.service.complete(f.actor, callback)).toEqual({ recordId: 'rec-test' });
    await expect(f.service.complete(f.actor, callback)).rejects.toThrow('expired');
    const mixed = await f.begin();
    mixed.searchParams.set('iss', 'https://attacker.example');
    await expect(f.service.complete(f.actor, mixed)).rejects.toThrow('verified');
    expect(f.state.exchanges).toBe(1);
    const expired = await f.begin();
    f.state.now += 600001;
    await expect(f.service.complete(f.actor, expired)).rejects.toThrow('expired');
    const denial = await f.begin();
    denial.searchParams.delete('code');
    denial.searchParams.set('error', 'access_denied');
    await expect(f.service.complete(f.actor, denial)).rejects.toThrow('verified');
    expect(f.state.exchanges).toBe(1);
    f.state.badScope = true;
    await expect(f.service.complete(f.actor, await f.begin())).rejects.toThrow('verified');
  } finally {
    await f.db.close();
  }
});

test('encrypted, owner-bound credentials survive service restart; concurrent refresh rotates once and revocation stops generation', async () => {
  const f = await fixture();
  try {
    await f.service.complete(f.actor, await f.begin());
    const encrypted = await f.repository.read('alice', 'tokens');
    expect(encrypted).not.toContain('private-access');
    expect(await f.repository.read('alice', 'client')).not.toContain('client-secret');
    expect(() => f.vault.open('bob:tokens', encrypted ?? '')).toThrow();
    expect((await f.service.status('bob')).connected).toBe(false);
    const restarted = createUtilintService({
      repository: f.repository,
      records: f.records,
      vault: f.vault,
      origin: 'https://content.example',
    });
    expect((await restarted.status('alice')).connected).toBe(true);
    await expect(f.service.generate({ ownerId: 'bob', id: 'rec-test' })).rejects.toThrow(
      'not found',
    );
    f.state.now += 900000;
    const first = f.service.generate({ ownerId: 'alice', id: 'rec-test' });
    await expect(f.service.generate({ ownerId: 'alice', id: 'rec-test' })).rejects.toThrow(
      'already',
    );
    expect((await first).summary.text).toBe('A faithful summary.');
    expect(f.state.refreshes).toBe(1);
    expect(f.state.calls).toBe(1);
    const duplicate = await f.service.generate({ ownerId: 'alice', id: 'rec-test' });
    expect(duplicate.summary.text).toBe('A faithful summary.');
    expect(f.state.calls).toBe(1);
    await f.service.disconnect('alice');
    expect((await restarted.generate({ ownerId: 'alice', id: 'rec-test' })).summary).toEqual(
      duplicate.summary,
    );
    expect(f.state.calls).toBe(1);
    await f.service.complete(f.actor, await f.begin());
    await f.records.edit({
      ownerId: 'alice',
      id: 'rec-test',
      title: 'Record',
      markdown: 'Changed transcript',
    });
    expect((await f.service.summary({ ownerId: 'alice', id: 'rec-test' })).summary).toBeNull();
    f.state.revoked = true;
    await expect(f.service.generate({ ownerId: 'alice', id: 'rec-test' })).rejects.toThrow(
      'Connect utilint',
    );
    expect((await f.service.status('alice')).connected).toBe(false);
    expect(f.state.calls).toBe(1);
  } finally {
    await f.db.close();
  }
});

test('disconnect invalidates pending flows and summary persistence follows record deletion', async () => {
  const f = await fixture();
  try {
    const pending = await f.begin();
    await f.service.disconnect('alice');
    await expect(f.service.complete(f.actor, pending)).rejects.toThrow('expired');
    await f.service.complete(f.actor, await f.begin());
    await f.service.generate({ ownerId: 'alice', id: 'rec-test' });
    await f.records.remove({ ownerId: 'alice', id: 'rec-test' });
    expect(await f.db`SELECT * FROM record_summaries`).toHaveLength(0);
    expect(await f.db.unsafe('PRAGMA foreign_key_check')).toHaveLength(0);
  } finally {
    await f.db.close();
  }
});
