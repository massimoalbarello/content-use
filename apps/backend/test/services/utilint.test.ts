import { expect, test } from 'bun:test';
import { createUtilintVault } from '../../src/lib/utilint-vault';
import { SqliteRecordsRepository } from '../../src/repositories/records/repository';
import { SqliteUtilintRepository } from '../../src/repositories/utilint/repository';
import { createUtilintClient } from '../../src/services/utilint/client';
import { createUtilintService } from '../../src/services/utilint/service';
import { testDatabase } from '../support/database';

async function fixture() {
  const db = await testDatabase();
  const repository = new SqliteUtilintRepository(db);
  const records = new SqliteRecordsRepository(db);
  const vault = createUtilintVault(crypto.randomUUID().repeat(2));
  const state = {
    now: Date.now(),
    registrations: 0,
    exchanges: 0,
    refreshes: 0,
    calls: 0,
    revoked: false,
    badScope: false,
    onGenerate: async () => {},
  };
  const external = (async (url, init) => {
    const target = String(url);
    if (target === 'https://utilint.example/api/auth/oauth2/register') {
      state.registrations++;
      return Response.json(
        {
          ...JSON.parse(String(init?.body)),
          client_id: 'client',
          client_secret: 'client-secret',
          client_secret_expires_at: 0,
        },
        { status: 201 },
      );
    }
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
  const client = createUtilintClient({
    repository,
    vault,
    callback: 'https://content.example/api/utilint/callback',
    utilintOrigin: 'https://utilint.example',
    transport: external,
  });
  const service = createUtilintService({
    client,
    repository,
    records,
    vault,
    origin: 'https://content.example',
    transport: external,
    now: () => state.now,
  });
  const actor = { ownerId: 'alice', sessionId: 'session-a' };
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
  return { db, repository, records, vault, client, service, state, actor, begin };
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
    expect(await f.repository.readClient()).not.toContain('client-secret');
    expect(() => f.vault.open('bob:tokens', encrypted ?? '')).toThrow();
    expect((await f.service.status('bob')).connected).toBe(false);
    const restarted = createUtilintService({
      client: createUtilintClient({
        repository: f.repository,
        vault: f.vault,
        callback: 'https://content.example/api/utilint/callback',
        utilintOrigin: 'https://utilint.example',
      }),
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

test('one deployment registration serves separate users and survives restart and disconnect', async () => {
  const f = await fixture();
  try {
    const bob = { ownerId: 'bob', sessionId: 'session-b' };
    const [aliceUrl, bobUrl] = await Promise.all([f.service.begin(f.actor), f.service.begin(bob)]);
    expect(f.state.registrations).toBe(1);
    expect(new URL(aliceUrl.url).pathname).toBe(new URL(bobUrl.url).pathname);
    const callback = (url: string) => {
      const result = new URL('https://content.example/api/utilint/callback');
      result.search = new URLSearchParams({
        state: new URL(url).searchParams.get('state') ?? '',
        code: 'one-use-code',
        iss: 'https://utilint.example/api/auth',
      }).toString();
      return result;
    };
    await f.service.complete(f.actor, callback(aliceUrl.url));
    expect((await f.service.status('bob')).connected).toBe(false);
    await expect(f.service.complete(bob, callback(aliceUrl.url))).rejects.toThrow('expired');
    await f.service.complete(bob, callback(bobUrl.url));
    expect((await f.service.status('bob')).connected).toBe(true);
    await f.service.disconnect('alice');
    expect((await f.service.status('alice')).connected).toBe(false);
    expect((await f.service.status('bob')).connected).toBe(true);
    const restarted = createUtilintClient({
      repository: f.repository,
      vault: f.vault,
      callback: 'https://content.example/api/utilint/callback',
      utilintOrigin: 'https://utilint.example',
      transport: ((_url: Parameters<typeof fetch>[0]) =>
        Promise.reject(new Error('Must reuse registration'))) as typeof fetch,
    });
    expect((await restarted.get()).clientId).toBe('client');
    expect(await f.db`SELECT id FROM utilint_client`).toHaveLength(1);
    expect(await f.db`SELECT owner_id FROM utilint_secrets WHERE kind='client'`).toHaveLength(0);
  } finally {
    await f.db.close();
  }
});

test('existing app credentials and legacy user tokens remain usable without registering another app', async () => {
  const f = await fixture();
  try {
    const config = {
      origin: 'https://utilint.example',
      clientId: 'original-client',
      clientSecret: 'original-secret',
    };
    await f.repository.write('alice', 'client', f.vault.seal('alice:client', config));
    const tokens = {
      accessToken: 'legacy-token',
      refreshToken: 'legacy-refresh',
      expiresAt: Date.now() + 900000,
    };
    await f.repository.write('alice', 'tokens', f.vault.seal('alice:tokens', tokens));
    await f.repository.write('bob', 'tokens', f.vault.seal('bob:tokens', tokens));
    const client = createUtilintClient({
      repository: f.repository,
      vault: f.vault,
      callback: 'https://content.example/api/utilint/callback',
      legacyOwnerId: 'alice',
    });
    const service = createUtilintService({
      client,
      repository: f.repository,
      records: f.records,
      vault: f.vault,
      origin: 'https://content.example',
    });
    expect(await client.get()).toEqual(config);
    expect((await service.status('alice')).connected).toBe(true);
    expect((await service.status('bob')).connected).toBe(false);
    expect(await f.repository.readClient()).toBeNull();
    expect(f.state.registrations).toBe(0);
    await service.disconnect('alice');
    expect((await client.get()).clientId).toBe('original-client');
  } finally {
    await f.db.close();
  }
});

test('credentials cannot move between issuers, clients, or callback origins', async () => {
  const f = await fixture();
  try {
    await f.service.complete(f.actor, await f.begin());
    for (const patch of [{ origin: 'https://other.example' }, { clientId: 'other-client' }]) {
      const tokens = f.vault.open<Record<string, unknown>>(
        'alice:tokens',
        (await f.repository.read('alice', 'tokens'))!,
      );
      await f.repository.write(
        'alice',
        'tokens',
        f.vault.seal('alice:tokens', { ...tokens, ...patch }),
      );
      expect((await f.service.status('alice')).connected).toBe(false);
      await expect(f.service.generate({ ownerId: 'alice', id: 'rec-test' })).rejects.toThrow(
        'Connect utilint',
      );
    }
    expect(f.state.calls).toBe(0);
    const moved = createUtilintClient({
      repository: f.repository,
      vault: f.vault,
      callback: 'https://other-content.example/api/utilint/callback',
    });
    await expect(moved.get()).rejects.toThrow('host needs');
  } finally {
    await f.db.close();
  }
});

test('failed dynamic registration stores nothing and a subsequent user action can retry', async () => {
  const f = await fixture();
  try {
    let fail = true;
    const client = createUtilintClient({
      repository: f.repository,
      vault: f.vault,
      callback: 'https://content.example/api/utilint/callback',
      transport: ((_url, init) => {
        if (fail) {
          return Promise.resolve(
            Response.json({ error: 'temporarily_unavailable' }, { status: 503 }),
          );
        }
        return Promise.resolve(
          Response.json(
            {
              ...JSON.parse(String(init?.body)),
              client_id: 'recovered',
              client_secret: 'secret',
              client_secret_expires_at: 0,
            },
            { status: 201 },
          ),
        );
      }) as typeof fetch,
    });
    await expect(client.get()).rejects.toThrow('try again');
    expect(await f.repository.readClient()).toBeNull();
    fail = false;
    expect((await client.get()).clientId).toBe('recovered');
  } finally {
    await f.db.close();
  }
});
