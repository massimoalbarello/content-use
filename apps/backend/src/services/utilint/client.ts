import * as oauth from 'oauth4webapi';
import type { UtilintVault } from '#lib/utilint-vault.ts';
import { DomainError } from '#models/records.ts';
import type { UtilintRepository } from '#repositories/utilint/repository.ts';

export type ClientConfig = { origin: string; clientId: string; clientSecret: string };
type RegisteredClient = ClientConfig & { callback: string };
const clientKey = 'utilint:deployment-client';
const defaultOrigin = 'https://utilint-crrxrd.nibrun.app';

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
  async function read(): Promise<ClientConfig | null> {
    const encrypted = await repository.readClient();
    if (encrypted) {
      const config = vault.open<RegisteredClient>(clientKey, encrypted);
      if (config.callback !== callback || (utilintOrigin && config.origin !== origin)) {
        throw new DomainError('The host needs to update the Utilint app configuration.', 503);
      }
      return config;
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
      return config;
    }
    return null;
  }
  async function register(): Promise<ClientConfig> {
    const saved = await read();
    if (saved) {
      return saved;
    }
    try {
      const server: oauth.AuthorizationServer = {
        issuer: `${origin}/api/auth`,
        registration_endpoint: `${origin}/api/auth/oauth2/register`,
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
          ...(new URL(origin).protocol === 'http:' ? { [oauth.allowInsecureRequests]: true } : {}),
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
        origin,
        callback,
        clientId: result.client_id,
        clientSecret: result.client_secret,
      };
      // Insert-only: another process must never replace this deployment's active client.
      await repository.saveClientIfAbsent(vault.seal(clientKey, config));
      return (await read())!;
    } catch {
      throw new DomainError('Could not connect to Utilint. Please try again shortly.', 502);
    }
  }
  return {
    origin,
    read,
    get() {
      pending ??= register().finally(() => {
        pending = undefined;
      });
      return pending;
    },
  };
}
export type UtilintClient = ReturnType<typeof createUtilintClient>;
