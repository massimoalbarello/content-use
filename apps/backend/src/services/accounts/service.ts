import { type AccountDiscovery, accountUrl, publicAccount } from '#models/accounts.ts';
import { type Actor, DomainError } from '#models/records.ts';
import type { AccountsRepository } from '#repositories/accounts/repository.ts';
import type { PlaylistsRepository } from '#repositories/playlists/repository.ts';

export interface AccountsDiscovery {
  list(url: string, signal: AbortSignal): Promise<AccountDiscovery>;
}

export class AccountsService {
  constructor(
    private readonly repository: AccountsRepository,
    private readonly playlists: PlaylistsRepository,
    private readonly discovery: AccountsDiscovery,
    private readonly jobs: { wake(): void },
  ) {}
  async list(actor: Actor) {
    return (await this.repository.list(actor)).map(publicAccount);
  }
  async get(input: Actor & { id: string }) {
    const [account] = await this.repository.list(input);
    if (!account) {
      throw new DomainError('Account not found.', 404);
    }
    return publicAccount(account);
  }
  async create(input: Actor & { url: string }, signal: AbortSignal) {
    const source = await this.discover(accountUrl(input.url), signal);
    const id = await this.repository.create({
      ownerId: input.ownerId,
      youtubeId: source.youtubeId,
      url: source.url,
      title: source.title,
    });
    return { id };
  }
  async edit(input: Actor & { id: string; title: string }) {
    const title = input.title.trim();
    if (!title || title.length > 300) {
      throw new DomainError('Enter an account name of up to 300 characters.');
    }
    if (!(await this.repository.edit({ ...input, title }))) {
      throw new DomainError('Account not found.', 404);
    }
    return { updated: true };
  }
  async remove(input: Actor & { id: string }) {
    if (!(await this.repository.remove(input))) {
      throw new DomainError('Account not found.', 404);
    }
    return { deleted: true };
  }
  async discoverPlaylists(input: Actor & { id: string }, signal: AbortSignal) {
    const account = await this.get(input);
    const source = await this.discover(account.url, signal);
    if (source.youtubeId !== account.youtubeId) {
      throw new DomainError('YouTube returned a different account. Try again.', 503);
    }
    return source.playlists;
  }
  async follow(input: Actor & { id: string; youtubeIds: string[] }, signal: AbortSignal) {
    const available = new Map(
      (await this.discoverPlaylists(input, signal)).map((playlist) => [
        playlist.youtubeId,
        playlist,
      ]),
    );
    const selected = [...new Set(input.youtubeIds)].map((id) => {
      const playlist = available.get(id);
      if (!playlist) {
        throw new DomainError(
          'A selected playlist is no longer public on this account. Refresh the playlists and try again.',
        );
      }
      return playlist;
    });
    if (!selected.length) {
      throw new DomainError('Select at least one playlist.');
    }
    const ids = await this.playlists.followAccount({
      ownerId: input.ownerId,
      accountId: input.id,
      playlists: selected,
    });
    if (!ids) {
      throw new DomainError('Account not found.', 404);
    }
    this.jobs.wake();
    return { ids };
  }
  private async discover(url: string, signal: AbortSignal) {
    try {
      return await this.discovery.list(url, AbortSignal.any([signal, AbortSignal.timeout(90000)]));
    } catch {
      throw new DomainError(
        'Could not load public playlists from YouTube. Check the account and try again.',
        503,
      );
    }
  }
}
