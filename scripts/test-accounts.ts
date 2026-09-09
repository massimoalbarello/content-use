import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Browser, chromium } from 'playwright-core';
import { createApp } from '../apps/backend/src/app';
import { assets } from '../apps/backend/src/assets.gen';
import { createSqliteDatabase } from '../apps/backend/src/db/client';
import { migrate } from '../apps/backend/src/db/migrate';
import { createAuth } from '../apps/backend/src/lib/auth/better-auth';
import { validatePublicUrl } from '../apps/backend/src/lib/media/public-url';
import type { AccountDiscovery } from '../apps/backend/src/models/accounts';
import { SqliteAccountsRepository } from '../apps/backend/src/repositories/accounts/repository';
import { SqliteOwnerRegistrationRepository } from '../apps/backend/src/repositories/owner-registration/repository';
import { SqlitePlaylistsRepository } from '../apps/backend/src/repositories/playlists/repository';
import { SqliteRecordsRepository } from '../apps/backend/src/repositories/records/repository';
import { AccountsService } from '../apps/backend/src/services/accounts/service';
import { OwnerRegistrationService } from '../apps/backend/src/services/owner-registration/service';
import { PlaylistsService } from '../apps/backend/src/services/playlists/service';
import { RecordsService } from '../apps/backend/src/services/records/service';

const dataFolder = await mkdtemp(join(tmpdir(), 'content-use-accounts-e2e-'));
const db = await createSqliteDatabase({ dataFolder });
const base = 'http://localhost:3110';
let browser: Browser | undefined;
let app: ReturnType<typeof createApp> | undefined;
let unavailable = false;
const source: AccountDiscovery = {
  youtubeId: 'UCN2hRGM8-gNDN5feecorWaQ',
  url: 'https://www.youtube.com/channel/UCN2hRGM8-gNDN5feecorWaQ',
  title: 'Learning channel',
  playlists: [
    { youtubeId: 'PLabcdefghijk', title: 'Calculus' },
    { youtubeId: 'PL01234567890', title: 'Linear algebra' },
    { youtubeId: 'PLnotselected', title: 'History' },
  ].map((playlist) => ({
    ...playlist,
    url: `https://www.youtube.com/playlist?list=${playlist.youtubeId}`,
  })),
};
try {
  await migrate(db);
  const playlists = new SqlitePlaylistsRepository(db);
  // Only external discovery and background execution are replaced. Authentication,
  // HTTP validation, persistence, and the frontend use the production composition.
  const jobs = {
    wake() {},
    cancel: () => Promise.resolve(),
    deleteFiles: () => Promise.resolve(),
    mediaPath: () => '',
  };
  const discovery = {
    list: (url: string) => {
      if (unavailable) {
        return Promise.reject(new Error('YouTube unavailable'));
      }
      return Promise.resolve(
        url.includes('@empty') || url.includes('UCabcdefghijklmnopqrstuv')
          ? {
              youtubeId: 'UCabcdefghijklmnopqrstuv',
              url: 'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv',
              title: 'Empty channel',
              playlists: [],
            }
          : source,
      );
    },
  };
  app = createApp({
    origin: base,
    assets,
    auth: createAuth({
      database: db,
      baseUrl: new URL(base),
      secret: crypto.randomUUID().repeat(2),
    }),
    registration: new OwnerRegistrationService(new SqliteOwnerRegistrationRepository(db)),
    accounts: new AccountsService(new SqliteAccountsRepository(db), playlists, discovery, jobs),
    playlists: new PlaylistsService(playlists, jobs, {
      list: () => Promise.resolve({ title: 'Test playlist', videos: [] }),
    }),
    records: new RecordsService(new SqliteRecordsRepository(db), jobs, validatePublicUrl),
  }).listen({ hostname: '127.0.0.1', port: 3110 });
  assert.equal((await fetch(`${base}/api/accounts`)).status, 401);
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await page.goto(base);
  await page.getByRole('button', { name: 'Create your passkey' }).click();
  await page.getByRole('heading', { name: 'Records', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Accounts', exact: true }).click();
  await page.getByText('No accounts yet', { exact: true }).waitFor();
  await page.getByRole('link', { name: 'Add account', exact: true }).click();
  await page.getByLabel('YouTube handle or channel URL').fill('https://localhost/private');
  await page.getByRole('button', { name: 'Find playlists', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Use a YouTube handle' }).waitFor();
  await page.getByLabel('YouTube handle or channel URL').fill('@learning');
  await page.getByRole('button', { name: 'Find playlists', exact: true }).click();
  await page.getByRole('heading', { name: 'Learning channel', exact: true }).waitFor();
  const accountUrl = page.url();
  const accountId = accountUrl.split('/').pop()!;
  await page.getByRole('checkbox', { name: 'Calculus', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Linear algebra', exact: true }).focus();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Follow selected (2)', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '2 playlists are now following' }).waitFor();
  assert.equal(
    await page.getByRole('checkbox', { name: 'History', exact: true }).isChecked(),
    false,
  );
  assert.equal(
    await page.getByRole('checkbox', { name: 'Calculus', exact: true }).isDisabled(),
    true,
  );
  const saved = await page.evaluate(async () => (await fetch('/api/playlists')).json());
  assert.equal(saved.length, 2);
  assert.ok(
    saved.every(
      (playlist: { account: { id: string }; enabled: boolean }) =>
        playlist.account.id === accountId && playlist.enabled,
    ),
  );
  assert.equal((await playlists.due()).length, 2);
  await page.reload();
  await page.getByRole('checkbox', { name: 'Calculus', exact: true }).waitFor();
  assert.equal(
    await page.getByRole('checkbox', { name: 'Calculus', exact: true }).isChecked(),
    true,
  );
  await page.getByRole('button', { name: 'Edit account', exact: true }).click();
  await page.getByLabel('Account name', { exact: true }).fill('My learning');
  await page.getByRole('button', { name: 'Save account', exact: true }).click();
  await page.getByRole('heading', { name: 'My learning', exact: true }).waitFor();
  await page.screenshot({ path: '/tmp/content-use-accounts-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: '/tmp/content-use-accounts-mobile.png', fullPage: true });
  await page.getByRole('link', { name: 'Following · View playlist', exact: true }).first().click();
  await page.getByRole('link', { name: 'My learning', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Pause playlist updates' }).click();
  await page.getByText('Updates paused', { exact: true }).waitFor();
  await page.getByRole('link', { name: 'My learning', exact: true }).click();
  await page.getByRole('link', { name: 'Paused · Select to resume', exact: true }).waitFor();
  await page.getByRole('checkbox', { name: 'Calculus', exact: true }).check();
  await page.getByRole('button', { name: 'Follow selected (1)', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '1 playlist is now following' }).waitFor();
  assert.equal((await playlists.due()).length, 2);
  unavailable = true;
  await page.getByRole('button', { name: 'Refresh playlists', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Could not load public playlists' }).waitFor();
  unavailable = false;
  await page.getByRole('button', { name: 'Refresh playlists', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh playlists', exact: true }).waitFor();
  await page.getByRole('link', { name: 'All accounts', exact: true }).click();
  await page.getByRole('link', { name: 'Add account', exact: true }).click();
  await page.getByLabel('YouTube handle or channel URL').fill('@empty');
  await page.getByRole('button', { name: 'Find playlists', exact: true }).click();
  await page.getByRole('heading', { name: 'Empty channel', exact: true }).waitFor();
  await page.getByText('No public playlists are visible', { exact: false }).waitFor();
  await page.goto(accountUrl);
  assert.equal(
    (
      await page.request.patch(`${base}/api/accounts/${accountId}`, { data: { title: 'CSRF' } })
    ).status(),
    403,
  );
  assert.equal(
    await page.evaluate(
      async (id) =>
        (
          await fetch(`/api/accounts/${id}/playlists`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ youtubeIds: [] }),
          })
        ).status,
      accountId,
    ),
    400,
  );
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete account', exact: true })
    .click();
  await page.getByRole('heading', { name: 'Accounts', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Empty channel', exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'My learning', exact: true }).count(), 0);
  const retained = await page.evaluate(async () => (await fetch('/api/playlists')).json());
  assert.equal(retained.length, 2);
  assert.ok(
    retained.every(
      (playlist: { account: unknown; enabled: boolean }) =>
        playlist.account === null && playlist.enabled,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS real passkey registration, account CRUD, multiple selection, polling eligibility, source links, pause/resume, empty/error states, HTTP validation, and mobile layout',
  );
} finally {
  await browser?.close();
  await app?.stop();
  await db.close();
  await rm(dataFolder, { recursive: true, force: true });
}
