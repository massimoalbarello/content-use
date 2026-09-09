import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const dataFolder = await mkdtemp(join(tmpdir(), 'content-use-e2e-'));
const port = 3100;
const base = `http://localhost:${port}`;
const server = Bun.spawn([process.execPath, 'apps/backend/src/main.ts'], {
  env: { ...process.env, DATA_FOLDER: dataFolder, BASE_URL: base, PORT: String(port) },
  stdout: 'pipe',
  stderr: 'pipe',
});
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) {
        break;
      }
    } catch {
      /* Wait for startup. */
    }
    await Bun.sleep(100);
  }
  assert.equal((await fetch(`${base}/api/records`)).status, 401);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('response', (response) => {
    if (response.status() >= 500) {
      console.log('SERVER ERROR', response.status(), response.url());
    }
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const primary = await cdp.send('WebAuthn.addVirtualAuthenticator', {
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
  await page.getByRole('button', { name: 'Create your passkey' }).waitFor();
  await page.screenshot({ path: '/tmp/content-use-login.png', fullPage: true });
  await page.getByRole('button', { name: 'Create your passkey' }).click();
  await page.getByRole('heading', { name: 'Records', exact: true }).waitFor({ timeout: 20000 });
  console.log('PASS real WebAuthn registration and authenticated dashboard');
  await page.getByRole('button', { name: 'New record', exact: true }).click();
  await page.getByLabel('Source URL').fill('http://127.0.0.1/private');
  await page.getByRole('button', { name: 'Create record', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'public' }).waitFor();
  await page
    .getByLabel('Source URL')
    .fill('https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/samples/jfk.wav');
  await page.getByLabel('Title').fill('A few words worth keeping');
  await page.getByRole('button', { name: 'Create record', exact: true }).click();
  await page.getByRole('heading', { name: 'A few words worth keeping' }).waitFor();
  await page
    .getByText('This source has no captions.', { exact: false })
    .waitFor({ timeout: 120000 });
  const recordUrl = page.url();
  const id = recordUrl.split('/').pop()!;
  const record = await page.evaluate(async (id) => (await fetch(`/api/records/${id}`)).json(), id);
  console.log('Download status:', record.status, record.error);
  assert.ok(record.mediaUrl, 'yt-dlp must download a real public recording');
  assert.equal(record.status, 'ready');
  assert.equal(record.error, null);
  const media = await page.evaluate(async (id) => {
    const response = await fetch(`/api/records/${id}/media`, { headers: { Range: 'bytes=0-99' } });
    return { status: response.status, size: (await response.arrayBuffer()).byteLength };
  }, id);
  assert.deepEqual(media, { status: 206, size: 100 });
  assert.equal((await fetch(`${base}/api/records/${id}/media`)).status, 401);
  console.log('PASS yt-dlp download, authenticated playback, range seeking, no-captions state');
  await page.getByRole('button', { name: 'Edit record' }).click();
  await page
    .getByLabel('Transcript · Markdown')
    .fill(
      '## A thought to keep\n\nThis is an **edited Markdown record**.\n\n- Original media\n- Editable transcript',
    );
  await page.getByRole('button', { name: 'Save record' }).click();
  await page.getByRole('heading', { name: 'A thought to keep' }).waitFor();
  const markdown = await page.evaluate(
    async (id) => (await fetch(`/api/records/${id}/markdown`)).text(),
    id,
  );
  assert.match(markdown, /<audio controls/);
  assert.match(markdown, /edited Markdown record/);
  await page.screenshot({ path: '/tmp/content-use-record.png', fullPage: true });
  await page.getByRole('link', { name: 'All records' }).click();
  await page.getByLabel('Search records').fill('edited Markdown');
  await page.getByRole('heading', { name: 'A few words worth keeping' }).waitFor();
  await page.screenshot({ path: '/tmp/content-use-dashboard.png', fullPage: true });
  console.log('PASS record edit, Markdown rendering/export, and transcript search');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    false,
  );
  await page.screenshot({ path: '/tmp/content-use-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'New record', exact: true }).click();
  await page.getByLabel('Source URL').fill('https://www.youtube.com/watch?v=rY0wnfFHYbs');
  await page.getByRole('button', { name: 'Create record', exact: true }).click();
  await page
    .getByRole('heading', { name: 'Open Models Change The Economics of AI', exact: true })
    .waitFor({ timeout: 75000 });
  const youtubeId = page.url().split('/').pop()!;
  const youtube = await page.evaluate(
    async (id) => (await fetch(`/api/records/${id}`)).json(),
    youtubeId,
  );
  assert.equal(youtube.status, 'ready');
  assert.equal(youtube.mediaUrl, null);
  assert.equal(youtube.embedUrl, 'https://www.youtube-nocookie.com/embed/rY0wnfFHYbs');
  assert.ok(
    youtube.markdown.split(/\s+/).length > 10000,
    'New URL must retrieve the full transcript automatically',
  );
  await page.screenshot({ path: '/tmp/content-use-youtube-record.png' });
  await page.getByRole('button', { name: 'Delete record', exact: true }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete record', exact: true })
    .click();
  await page.getByRole('heading', { name: 'Records', exact: true }).waitFor();
  console.log('PASS fresh YouTube URL → embedded video + full captions');
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await cdp.send('WebAuthn.removeVirtualAuthenticator', {
    authenticatorId: primary.authenticatorId,
  });
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
  await page.getByRole('button', { name: 'Add a passkey' }).click();
  await page
    .getByText('Passkey added.', { exact: true })
    .waitFor()
    .catch(async (error) => {
      console.log(await page.locator('body').innerText());
      throw error;
    });
  console.log('PASS additional passkey');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in with passkey' }).waitFor();
  console.log('PASS sign-out');
  await page.getByRole('button', { name: 'Sign in with passkey' }).click();
  await page.getByRole('heading', { name: 'Records', exact: true }).waitFor();
  console.log('PASS additional passkey, sign-out, and real WebAuthn sign-in');
  const csrf = await page.evaluate(
    async (id) =>
      (
        await fetch(`/api/records/${id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ title: 'Changed', markdown: 'Text' }),
        })
      ).status,
    id,
  );
  assert.equal(csrf, 200);
  await page.goto(recordUrl);
  await page.getByRole('button', { name: 'Delete record', exact: true }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete record', exact: true })
    .click();
  await page.getByRole('heading', { name: 'Records', exact: true }).waitFor();
  const deleted = await page.evaluate(async (id) => (await fetch(`/api/records/${id}`)).status, id);
  assert.equal(deleted, 404);
  assert.deepEqual(errors, []);
  console.log('PASS deletion, no browser exceptions, responsive layout');
} finally {
  await browser.close();
  server.kill('SIGTERM');
  await server.exited;
  const stderr = await new Response(server.stderr).text();
  if (stderr) {
    console.log(stderr);
  }
  await rm(dataFolder, { recursive: true, force: true });
}
