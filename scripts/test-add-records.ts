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
import { createUtilintVault } from '../apps/backend/src/lib/utilint-vault';
import { SqliteAccountsRepository } from '../apps/backend/src/repositories/accounts/repository';
import { SqliteOwnerRegistrationRepository } from '../apps/backend/src/repositories/owner-registration/repository';
import { SqlitePlaylistsRepository } from '../apps/backend/src/repositories/playlists/repository';
import { SqliteRecordsRepository } from '../apps/backend/src/repositories/records/repository';
import { SqliteUtilintRepository } from '../apps/backend/src/repositories/utilint/repository';
import { AccountsService } from '../apps/backend/src/services/accounts/service';
import { OwnerRegistrationService } from '../apps/backend/src/services/owner-registration/service';
import { PlaylistsService } from '../apps/backend/src/services/playlists/service';
import { RecordsService } from '../apps/backend/src/services/records/service';
import { createUtilintClient } from '../apps/backend/src/services/utilint/client';
import { createUtilintService } from '../apps/backend/src/services/utilint/service';

const dataFolder = await mkdtemp(join(tmpdir(), 'content-use-import-e2e-'));
const db = await createSqliteDatabase({ dataFolder });
const base = 'http://localhost:3111';
let browser: Browser | undefined;
let app: ReturnType<typeof createApp> | undefined;
let unavailable = false;
const videos = [
  { id: 'rY0wnfFHYbs', title: 'Introduction to calculus', duration: 90 },
  { id: 'aircAruvnKk', title: 'Understanding derivatives', duration: 120 },
  { id: 'dQw4w9WgXcQ', title: 'Optional extra lesson', duration: 60 },
];
const playlistUrl = 'https://www.youtube.com/playlist?list=PLabcdefghijk';
try {
  await migrate(db);
  const repository = new SqlitePlaylistsRepository(db);
  const jobs = {
    wake() {},
    cancel: () => Promise.resolve(),
    deleteFiles: () => Promise.resolve(),
    mediaPath: () => '',
  };
  const discovery = {
    list: (url: string) =>
      unavailable
        ? Promise.reject(new Error('YouTube unavailable'))
        : Promise.resolve({
            title: url === playlistUrl ? 'Z first playlist' : 'A second playlist',
            videos: url.includes('PLempty123456') ? [] : videos,
          }),
  };
  const recordsRepository = new SqliteRecordsRepository(db);
  const utilintRepository = new SqliteUtilintRepository(db);
  const vault = createUtilintVault(crypto.randomUUID().repeat(2));
  app = createApp({
    utilint: createUtilintService({
      client: createUtilintClient({
        repository: utilintRepository,
        vault,
        callback: `${base}/api/utilint/callback`,
      }),
      repository: utilintRepository,
      records: recordsRepository,
      origin: base,
      vault,
    }),
    origin: base,
    assets,
    auth: createAuth({
      database: db,
      baseUrl: new URL(base),
      secret: crypto.randomUUID().repeat(2),
    }),
    registration: new OwnerRegistrationService(new SqliteOwnerRegistrationRepository(db)),
    accounts: new AccountsService(
      new SqliteAccountsRepository(db),
      repository,
      {
        list: () => Promise.reject(new Error('Unused account discovery')),
      },
      jobs,
    ),
    playlists: new PlaylistsService(repository, jobs, discovery),
    records: new RecordsService(recordsRepository, jobs, validatePublicUrl),
  }).listen({ hostname: '127.0.0.1', port: 3111 });
  assert.equal(
    (await fetch(`${base}/api/playlists/preview?url=${encodeURIComponent(playlistUrl)}`)).status,
    401,
  );
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
  await page.getByRole('button', { name: 'Add records', exact: true }).first().click();
  await page.waitForURL('**/records/new');
  await page.getByRole('heading', { name: 'Add records', exact: true }).waitFor();
  await page.getByLabel('Source URL').fill(playlistUrl);
  await page.getByRole('button', { name: 'Add record', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Use Add playlist' }).waitFor();
  await page.getByLabel('Source URL').fill('https://youtu.be/rY0wnfFHYbs');
  await page.getByRole('button', { name: 'Add record', exact: true }).click();
  await page.waitForURL('**/records/rec-*');
  const originalRecordUrl = page.url();
  await page.getByRole('link', { name: 'Playlists', exact: true }).click();
  await page.getByRole('link', { name: 'Add playlist', exact: true }).click();
  await page.getByLabel('YouTube playlist URL').fill('https://example.com/not-a-playlist');
  await page.getByRole('button', { name: 'Find videos', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Use a public YouTube playlist URL' }).waitFor();
  unavailable = true;
  await page.getByLabel('YouTube playlist URL').fill(playlistUrl);
  await page.getByRole('button', { name: 'Find videos', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Could not load videos' }).waitFor();
  unavailable = false;
  await page.getByRole('button', { name: 'Find videos', exact: true }).click();
  await page.getByRole('heading', { name: 'Z first playlist', exact: true }).waitFor();
  assert.equal(await page.getByRole('checkbox').count(), 3);
  assert.equal(await page.getByRole('checkbox').first().isChecked(), true);
  assert.equal(
    await page.evaluate(async () => (await (await fetch('/api/playlists')).json()).length),
    0,
  );
  await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Add selected (0)' }).isDisabled(), true);
  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Optional extra lesson', exact: true }).focus();
  await page.keyboard.press('Space');
  await page.getByRole('status').filter({ hasText: '2 of 3 selected' }).waitFor();
  await page.screenshot({ path: '/tmp/content-use-add-playlist-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: '/tmp/content-use-add-playlist-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Add selected (2)', exact: true }).click();
  await page.waitForURL('**/playlists/pl-*');
  const firstPlaylistUrl = page.url();
  const first = await page.evaluate(async () => (await (await fetch('/api/playlists')).json())[0]);
  assert.equal(first.videoCount, 2);
  assert.equal(first.enabled, true);
  assert.equal(await page.getByText('Optional extra lesson', { exact: true }).count(), 0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('link', { name: 'All playlists', exact: true }).click();
  await page.getByRole('link', { name: 'Add playlist', exact: true }).click();
  await page
    .getByLabel('YouTube playlist URL')
    .fill('https://www.youtube.com/playlist?list=PL01234567890');
  await page.getByRole('button', { name: 'Find videos', exact: true }).click();
  await page.getByRole('button', { name: 'Add selected (3)', exact: true }).click();
  await page.waitForURL('**/playlists/pl-*');
  const records = await page.evaluate(
    async () => (await (await fetch('/api/records')).json()).records,
  );
  assert.equal(records.length, 3);
  const shared = records.find((record: { id: string }) => originalRecordUrl.endsWith(record.id));
  assert.deepEqual(shared.playlists, [{ id: first.id, title: 'Z first playlist' }]);
  await page.goto(originalRecordUrl);
  const attribution = page.getByRole('navigation', { name: 'Playlists', exact: true });
  await attribution.getByRole('link', { name: 'Z first playlist', exact: true }).waitFor();
  assert.equal(await attribution.getByRole('link').count(), 1);
  await page.goto(`${base}/records/new`);
  await page.getByLabel('Source URL').fill('https://www.youtube.com/shorts/rY0wnfFHYbs');
  await page.getByRole('button', { name: 'Add record', exact: true }).click();
  await page.waitForURL(originalRecordUrl);
  assert.equal(
    await page.evaluate(async () => (await (await fetch('/api/records')).json()).total),
    3,
  );
  await page.goto(`${base}/playlists/new`);
  await page.getByLabel('YouTube playlist URL').fill(playlistUrl);
  await page.getByRole('button', { name: 'Find videos', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Optional extra lesson', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Add selected (2)', exact: true }).click();
  await page.waitForURL(firstPlaylistUrl);
  assert.equal(
    await page.evaluate(async () => (await (await fetch('/api/playlists')).json()).length),
    2,
  );
  // Exercise authenticated transport validation as well as the form's disabled empty selection.
  for (const videoIds of [[], ['not-valid'], ['aaaaaaaaaaa']]) {
    assert.equal(
      await page.evaluate(
        async ({ url, videoIds }) =>
          (
            await fetch('/api/playlists', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ url, videoIds }),
            })
          ).status,
        { url: playlistUrl, videoIds },
      ),
      400,
    );
  }
  assert.equal(
    (
      await page.request.post(`${base}/api/playlists`, {
        data: { url: playlistUrl, videoIds: [videos[0]!.id] },
      })
    ).status(),
    403,
  );
  await page.goto(`${base}/playlists/new`);
  await page
    .getByLabel('YouTube playlist URL')
    .fill('https://www.youtube.com/playlist?list=PLempty123456');
  await page.getByRole('button', { name: 'Find videos', exact: true }).click();
  await page.getByText('No available videos were found.', { exact: false }).waitFor();
  assert.equal(await page.getByRole('checkbox').count(), 0);
  await page.goto(`${base}/new`);
  await page.waitForURL('**/records/new');
  assert.deepEqual(errors, []);
  console.log(
    'PASS real passkey registration, dedicated add pages, playlist preview, selection and keyboard controls, exclusions, record/playlist deduplication, first-playlist attribution, validation, errors, empty state, and mobile layout',
  );
} finally {
  await browser?.close();
  await app?.stop();
  await db.close();
  await rm(dataFolder, { recursive: true, force: true });
}
