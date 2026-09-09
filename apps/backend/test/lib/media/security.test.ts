import { expect, test } from 'bun:test';
import { createDownloadProxy } from '../../../src/lib/media/proxy';
import { isPublicAddress, parsePublicUrl } from '../../../src/lib/media/public-url';

test('blocks private, reserved, encoded loopback, credentials, and unsafe protocols', () => {
  for (const address of [
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    '::ffff:127.0.0.1',
    'fe80::1',
    'fc00::1',
    '224.0.0.1',
  ]) {
    expect(isPublicAddress(address)).toBe(false);
  }
  expect(isPublicAddress('1.1.1.1')).toBe(true);
  for (const url of [
    'file:///etc/passwd',
    'ftp://example.com/a',
    'http://localhost/a',
    'http://2130706433/a',
    'http://0x7f000001/a',
    'https://user:pass@example.com/a',
    'http://169.254.169.254/a',
    'https://example.com:8080/a',
  ]) {
    expect(() => parsePublicUrl(url)).toThrow();
  }
  expect(parsePublicUrl('https://example.com/a#t=5').href).toBe('https://example.com/a');
});
test('download proxy rejects HTTP and HTTPS connections to private destinations', async () => {
  const proxy = await createDownloadProxy();
  try {
    const response = await fetch('http://127.0.0.1:8000/private', { proxy: proxy.url });
    expect(response.status).toBe(403);
    const tunnel = await fetch('https://127.0.0.1/private', { proxy: proxy.url });
    expect(tunnel.status).toBe(403);
  } finally {
    proxy.close();
  }
});
