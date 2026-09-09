import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base = process.env.TEST_APP_URL;
if (!base || !new URL(base).hostname.startsWith('content-use-playlist-probe-')) {
  throw new Error('TEST_APP_URL must point to the disposable playlist probe app.');
}
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
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
  await page.getByRole('button', { name: 'Create your passkey', exact: true }).click();
  await page.getByRole('heading', { name: 'Records', exact: true }).waitFor();
  await page.getByRole('button', { name: 'New record', exact: true }).click();
  await page
    .getByLabel('Source URL')
    .fill('https://www.youtube.com/playlist?list=PLZHQObOWTQDMsr9K-rj53DwVRMYO3t5Yr');
  await page.getByRole('button', { name: 'Create record', exact: true }).click();
  await page
    .getByRole('heading', { name: 'Essence of calculus', exact: true })
    .waitFor({ timeout: 120000 });
  console.log('PASS public playlist discovery from nibrun');
  await page.getByRole('button', { name: 'Pause playlist updates' }).click();
  await page.getByText('Updates paused', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Resume playlist updates' }).click();
  await page.getByRole('button', { name: 'Pause playlist updates' }).waitFor();
  let result: { videoCount: number; readyCount: number } | undefined;
  for (let attempt = 0; attempt < 60; attempt++) {
    result = await page.evaluate(async () => (await (await fetch('/api/playlists')).json())[0]);
    if (result?.videoCount === 12) {
      break;
    }
    await Bun.sleep(1000);
  }
  assert.equal(result?.videoCount, 12, JSON.stringify(result));
  console.log('PASS all 12 playlist records synced', JSON.stringify(result));
  const records = await page.evaluate(
    async () => (await (await fetch('/api/records')).json()).records,
  );
  assert.equal(records.length, 12);
  assert.ok(
    records.every(
      (record: { duration: number | null }) =>
        typeof record.duration === 'number' && record.duration > 0,
    ),
  );
  assert.ok(
    records.every(
      (r: { thumbnailUrl: string | null; playlists: { id: string }[] }) =>
        r.thumbnailUrl && r.playlists.length === 1,
    ),
  );
  await page.reload();
  await page.getByRole('heading', { name: 'Synced records', exact: true }).waitFor();
  await page.getByText('Recent checks', { exact: true }).click();
  await page.getByText('12 checked · 12 new', { exact: true }).first().waitFor();
  await page.screenshot({ path: '/tmp/content-use-playlists-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/content-use-playlists-mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole('link', { name: 'All playlists', exact: true }).click();
  await page.getByRole('table').waitFor();
  assert.equal(await page.getByRole('columnheader', { name: 'Status', exact: true }).count(), 0);
  await page.screenshot({ path: '/tmp/content-use-playlist-table-mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: '/tmp/content-use-playlist-table-desktop.png', fullPage: true });
  await page
    .getByRole('table')
    .getByRole('link', { name: 'Essence of calculus', exact: true })
    .click();
  await page.getByRole('heading', { name: 'Synced records', exact: true }).waitFor();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Records', exact: true })
    .click();
  await page.getByRole('heading', { name: 'Records', exact: true }).waitFor();
  assert.equal(await page.getByRole('region', { name: 'Playlist activity' }).count(), 0);
  await page.getByRole('button', { name: 'Completed', exact: true }).click();
  await page.waitForURL(/status=ready/);
  await page.reload();
  await page.getByRole('button', { name: 'Completed', exact: true, pressed: true }).waitFor();
  await page.locator('main [aria-busy="false"]').waitFor();

  await page.screenshot({ path: '/tmp/content-use-records-filtered-desktop.png', fullPage: true });
  await page.getByLabel('Search records', { exact: true }).fill('derivative');
  await page.waitForURL(/q=derivative/);
  assert.ok(page.url().includes('status=ready'));
  await page.getByRole('button', { name: 'Clear search' }).click();
  for (const [label, status] of [
    ['Failed', 'failed'],
    ['Queued', 'queued'],
    ['Processing', 'processing'],
  ] as const) {
    const response = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/records' &&
        new URL(response.url()).searchParams.get('status') === status,
    );
    await page.getByRole('button', { name: label, exact: true }).click();
    const payload = await (await response).json();
    assert.ok(
      payload.records.every((r: { status: string }) =>
        status === 'processing'
          ? ['downloading', 'transcribing'].includes(r.status)
          : r.status === status,
      ),
    );
    await page.getByRole('button', { name: label, exact: true, pressed: true }).waitFor();
  }
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByRole('heading', { level: 3 }).first().waitFor();
  await page
    .getByRole('navigation', { name: 'Playlists', exact: true })
    .first()
    .getByRole('link')
    .click();
  await page.getByRole('heading', { name: 'Essence of calculus', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Failed', exact: true }).click();
  await page.getByRole('button', { name: 'Failed', exact: true, pressed: true }).waitFor();
  await page
    .getByLabel('Search synced records', { exact: true })
    .fill('no-record-will-match-this-phrase');
  await page.getByText('No records match these filters.', { exact: true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'Failed', exact: true, pressed: true }).waitFor();
  await page.goto(`${base}/records/${records[0].id}`);
  const record = await page.evaluate(async () =>
    (await fetch(`/api/records/${location.pathname.split('/').pop()}`)).json(),
  );
  assert.ok(record.status);
  assert.ok(record.duration > 0);
  assert.ok(record.embedUrl);
  assert.equal(record.playlists.length, 1);
  await page
    .getByRole('navigation', { name: 'Playlists', exact: true })
    .getByRole('link')
    .waitFor();
  assert.equal(record.mediaUrl, null);
  assert.deepEqual(errors, []);
  console.log(
    'PASS playlist table/detail, poll history, pause/resume, thumbnails, tags, status filters, reload persistence, and mobile layout',
  );
} finally {
  await browser.close();
}
