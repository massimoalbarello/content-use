import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { DomainError } from '#models/records.ts';
export function isPublicAddress(address: string) {
  try {
    const ip = ipaddr.process(address);
    return ip.range() === 'unicast';
  } catch {
    return false;
  }
}
export function parsePublicUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new DomainError('Enter a valid public audio or video URL.');
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !['80', '443'].includes(url.port))
  ) {
    throw new DomainError('Use a public HTTP or HTTPS URL without credentials or a custom port.');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    !hostname.includes('.') ||
    (ipaddr.isValid(hostname) && !isPublicAddress(hostname))
  ) {
    throw new DomainError('Only public internet addresses are supported.');
  }
  url.hash = '';
  return url;
}
export async function publicAddress(hostname: string): Promise<string> {
  const addresses = await lookup(hostname.replace(/^\[|\]$/g, ''), { all: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new DomainError('The URL resolves to a private or reserved network address.');
  }
  return (addresses.find((a) => !a.address.includes(':')) ?? addresses[0])!.address;
}
export async function validatePublicUrl(input: string) {
  const url = parsePublicUrl(input);
  await publicAddress(url.hostname);
  return url.href;
}
