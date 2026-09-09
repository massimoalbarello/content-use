import assert from 'node:assert/strict';
import type { Page, Route } from 'playwright-core';

// Run after real passkey registration. Only the record-list response is a UI fixture.
export async function testRecordScroll(page: Page) {
  const base = new URL(page.url()).origin;
  const items = Array.from({ length: 103 }, (_, index) => ({
    id: `scroll-${index}`,
    title: `Scroll record ${index}`,
    url: 'https://example.com/video',
    status: index < 3 ? 'failed' : 'ready',
    progress: '',
    error: null,
    mediaType: 'video',
    duration: 60,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    thumbnailUrl: null,
    hasTranscript: true,
    playlists: [],
  }));
  let failNextPage = true;
  const requests: { offset: number; search: string; status: string }[] = [];
  const respond = async (route: Route) => {
    const params = new URL(route.request().url()).searchParams;
    const offset = Number(params.get('offset'));
    const search = params.get('search') ?? '';
    const status = params.get('status') ?? 'all';
    requests.push({ offset, search, status });
    if (offset === 50 && failNextPage) {
      await route.fulfill({ status: 503, json: { message: 'Could not load more records.' } });
      return;
    }
    const filtered = items.filter(
      (item) => item.title.includes(search) && (status === 'all' || item.status === status),
    );
    await route.fulfill({
      json: { records: filtered.slice(offset, offset + 50), total: filtered.length },
    });
  };
  await page.route('**/api/records?*', respond);
  const rows = page.getByRole('link', { name: /^Open Scroll record/ });
  try {
    await page.goto(base);
    await rows.nth(49).waitFor();
    assert.equal(await rows.count(), 50);
    assert.equal(await page.getByRole('button', { name: 'Next', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Load more', exact: true }).scrollIntoViewIfNeeded();
    await page.getByRole('alert').filter({ hasText: 'Could not load more records.' }).waitFor();
    assert.equal(await rows.count(), 50, 'A failed next page must preserve loaded records');
    failNextPage = false;
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await rows.nth(99).waitFor();
    await page.getByRole('button', { name: 'Load more', exact: true }).scrollIntoViewIfNeeded();
    await rows.nth(102).waitFor();
    assert.equal(await rows.count(), 103);
    assert.equal(
      new Set(await rows.evaluateAll((links) => links.map((link) => link.getAttribute('href'))))
        .size,
      103,
    );
    assert.equal(await page.getByRole('button', { name: 'Load more', exact: true }).count(), 0);
    assert.ok(requests.some((request) => request.offset === 100));
    assert.ok(requests.every((request) => request.offset <= 100));
    console.log('PASS automatic record loading, retry without losing rows, and end of list');

    await page.getByRole('button', { name: 'Failed', exact: true }).click();
    await page.waitForFunction(
      () => document.querySelectorAll('a[aria-label^="Open Scroll record"]').length === 3,
    );
    assert.ok(
      requests
        .filter((request) => request.status === 'failed')
        .every((request) => request.offset === 0),
    );
    await page.getByLabel('Search records', { exact: true }).fill('record 2');
    await page.waitForFunction(
      () => document.querySelectorAll('a[aria-label^="Open Scroll record"]').length === 1,
    );
    assert.equal(await rows.first().getAttribute('aria-label'), 'Open Scroll record 2');
    assert.ok(
      requests
        .filter((request) => request.search === 'record 2')
        .every((request) => request.offset === 0),
    );
    await page.getByLabel('Search records', { exact: true }).fill('does not exist');
    await page.getByRole('heading', { name: 'No matching records' }).waitFor();
    assert.equal(await rows.count(), 0);
    console.log('PASS filters and search start from the first batch and clear old results');
  } finally {
    await page.unroute('**/api/records?*', respond);
    await page.goto(base);
  }
}
