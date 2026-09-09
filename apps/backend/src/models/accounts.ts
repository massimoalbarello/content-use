import { DomainError } from './records';

export type Account = {
  id: string;
  ownerId: string;
  youtubeId: string;
  url: string;
  title: string;
};
export type AccountPlaylist = { youtubeId: string; url: string; title: string };
export type AccountDiscovery = {
  youtubeId: string;
  url: string;
  title: string;
  playlists: AccountPlaylist[];
};

export function accountUrl(source: string): string {
  const value = source.trim();
  const invalid = () => new DomainError('Use a YouTube handle or channel URL.');
  let url: URL;
  try {
    url = new URL(value.startsWith('@') ? `https://www.youtube.com/${value}` : value);
  } catch {
    throw invalid();
  }
  if (
    url.protocol !== 'https:' ||
    !['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port
  ) {
    throw invalid();
  }
  const path = url.pathname
    .replace(/\/(?:playlists|featured|videos|shorts|streams)\/?$/, '')
    .replace(/\/$/, '');
  if (!/^\/(?:@[^/?#]+|channel\/UC[a-zA-Z0-9_-]{22}|(?:user|c)\/[^/?#]+)$/.test(path)) {
    throw invalid();
  }
  return `https://www.youtube.com${path}/playlists`;
}

export function publicAccount(account: Account) {
  return { id: account.id, youtubeId: account.youtubeId, url: account.url, title: account.title };
}
