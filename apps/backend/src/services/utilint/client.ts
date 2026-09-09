import * as oauth from 'oauth4webapi';
import type { UtilintVault } from '#lib/utilint-vault.ts';
import { DomainError } from '#models/records.ts';
import type { UtilintRepository } from '#repositories/utilint/repository.ts';

export type ClientConfig = { origin: string; clientId: string; clientSecret: string };
type RegisteredClient = ClientConfig & { callback: string };
const clientKey = 'utilint:deployment-client';
const defaultOrigin = 'https://utilint.com';

function providerOrigin(input: string) {
  const url = new URL(input);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    !(
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    )
  ) {
    throw new Error('UTILINT_URL must be an HTTPS origin (or HTTP localhost for development).');
  }
  return url.origin;
}

// The deployment owns the client. User sessions own only authorization attempts and tokens.
export function createUtilintClient({
  repository,
  vault,
  callback,
  utilintOrigin,
  legacyOwnerId,
  transport = fetch,
}: {
  repository: UtilintRepository;
  vault: UtilintVault;
  callback: string;
  utilintOrigin?: string;
  legacyOwnerId?: string;
  transport?: typeof fetch;
}) {
  const origin = providerOrigin(utilintOrigin ?? defaultOrigin);
  let pending: Promise<ClientConfig> | undefined;
  async function snapshot(): Promise<{ config: ClientConfig; encrypted: string | null } | null> {
    const encrypted = await repository.readClient();
    if (encrypted) {
      const config = vault.open<RegisteredClient>(clientKey, encrypted);
      if (config.callback !== callback || (utilintOrigin && config.origin !== origin)) {
        throw new DomainError('The host needs to update the Utilint app configuration.', 503);
      }
      return { config, encrypted };
    }
    // Read compatibility for the deployed private workspace's original app registration.
    // Its credentials and user grants are retained; no data backfill runs at startup.
    if (!legacyOwnerId) {
      return null;
    }
    const legacy = await repository.read(legacyOwnerId, 'client');
    if (legacy) {
      const config = vault.open<ClientConfig>(`${legacyOwnerId}:client`, legacy);
      providerOrigin(config.origin);
      if (utilintOrigin && config.origin !== origin) {
        throw new DomainError('The host needs to update the Utilint app configuration.', 503);
      }
      return { config, encrypted: null };
    }
    return null;
  }
  async function read() {
    return (await snapshot())?.config ?? null;
  }
  async function registrationStatus(config: ClientConfig) {
    try {
      const response = await transport(
        `${config.origin}/api/connect/clients/${encodeURIComponent(config.clientId)}/status`,
        {
          redirect: 'error',
          signal: AbortSignal.timeout(10000),
          headers: { accept: 'application/json' },
        },
      );
      if (response.status !== 200) {
        throw new Error('Client status unavailable');
      }
      const result = (await response.json()) as { clientId?: unknown; status?: unknown };
      if (
        result.clientId !== config.clientId ||
        typeof result.status !== 'string' ||
        !['active', 'missing', 'disabled'].includes(result.status)
      ) {
        throw new Error('Invalid client status');
      }
      return result.status as 'active' | 'missing' | 'disabled';
    } catch {
      throw new DomainError(
        'Could not verify the Utilint connection. Please try again shortly.',
        502,
      );
    }
  }
  async function ensureRegistered(): Promise<ClientConfig> {
    const saved = await snapshot();
    if (saved) {
      const status = await registrationStatus(saved.config);
      if (status === 'active') {
        return saved.config;
      }
      if (status === 'disabled') {
        throw new DomainError('This app has been disabled on Utilint. Contact the app host.', 403);
      }
    }
    return register(saved?.config.origin ?? origin, saved?.encrypted ?? null);
  }
  async function register(
    registrationOrigin: string,
    expected: string | null,
  ): Promise<ClientConfig> {
    try {
      const server: oauth.AuthorizationServer = {
        issuer: `${registrationOrigin}/api/auth`,
        registration_endpoint: `${registrationOrigin}/api/auth/oauth2/register`,
      };
      const response = await oauth.dynamicClientRegistrationRequest(
        server,
        {
          client_name: 'Content Use',
          redirect_uris: [callback],
          application_type: ['localhost', '127.0.0.1', '[::1]'].includes(new URL(callback).hostname)
            ? 'native'
            : 'web',
          token_endpoint_auth_method: 'client_secret_basic',
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          scope: 'profile ai:invoke offline_access',
        },
        {
          [oauth.customFetch]: transport,
          ...(new URL(registrationOrigin).protocol === 'http:'
            ? { [oauth.allowInsecureRequests]: true }
            : {}),
          signal: AbortSignal.timeout(20000),
        },
      );
      const result = await oauth.processDynamicClientRegistrationResponse(response);
      if (
        typeof result.client_secret !== 'string' ||
        !result.client_secret ||
        result.token_endpoint_auth_method !== 'client_secret_basic' ||
        !Array.isArray(result.redirect_uris) ||
        result.redirect_uris.length !== 1 ||
        result.redirect_uris[0] !== callback
      ) {
        throw new Error('Incomplete registration');
      }
      const config: RegisteredClient = {
        origin: registrationOrigin,
        callback,
        clientId: result.client_id,
        clientSecret: result.client_secret,
      };
      // Replace only the exact version checked above; keep concurrent repairs and old tokens isolated.
      await repository.saveClient(vault.seal(clientKey, config), expected);
      return (await read())!;
    } catch {
      throw new DomainError('Could not connect to Utilint. Please try again shortly.', 502);
    }
  }
  return {
    origin,
    read,
    get() {
      pending ??= ensureRegistered().finally(() => {
        pending = undefined;
      });
      return pending;
    },
  };
}
export type UtilintClient = ReturnType<typeof createUtilintClient>;
