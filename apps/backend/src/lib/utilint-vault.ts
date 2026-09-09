import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
export function createUtilintVault(secret: string) {
  const key = Buffer.from(hkdfSync('sha256', secret, 'content-use', 'utilint-v1', 32));
  return {
    seal(context: string, value: unknown) {
      const nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, nonce);
      cipher.setAAD(Buffer.from(context));
      const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
      return [
        'v1',
        nonce.toString('base64url'),
        cipher.getAuthTag().toString('base64url'),
        encrypted.toString('base64url'),
      ].join('.');
    },
    open<T>(context: string, value: string): T {
      const [version, nonce, tag, encrypted, extra] = value.split('.');
      if (version !== 'v1' || !nonce || !tag || !encrypted || extra) {
        throw new Error('Invalid stored Utilint connection.');
      }
      const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'base64url'));
      cipher.setAAD(Buffer.from(context));
      cipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return JSON.parse(
        Buffer.concat([
          cipher.update(Buffer.from(encrypted, 'base64url')),
          cipher.final(),
        ]).toString(),
      );
    },
  };
}
export type UtilintVault = ReturnType<typeof createUtilintVault>;
