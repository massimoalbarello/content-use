import { queryOptions } from '@tanstack/react-query';
import { api, unwrap } from './api';
export const utilintOptions = queryOptions({
  queryKey: ['utilint'],
  queryFn: async () => unwrap(await api.utilint.get()),
});
export const summaryOptions = (id: string) =>
  queryOptions({
    queryKey: ['summaries', id],
    queryFn: async () => unwrap(await api.records({ id }).summary.get()),
  });
export const generateSummary = async (id: string) =>
  unwrap(await api.records({ id }).summary.post());
export const configureUtilint = async (input: {
  origin: string;
  clientId: string;
  clientSecret: string;
}) => unwrap(await api.utilint.client.put(input));
export const disconnectUtilint = async () => unwrap(await api.utilint.connection.delete());

// Open synchronously from the user's click, then begin the session-bound flow on our backend.
export async function connectUtilint(recordId?: string) {
  const popup = window.open(
    'about:blank',
    `utilint-${crypto.randomUUID()}`,
    'popup,width=500,height=760',
  );
  let url: string;
  try {
    ({ url } = unwrap(await api.utilint.connect.post({ recordId })));
  } catch (error) {
    popup?.close();
    throw error;
  }
  if (!popup) {
    window.location.assign(url);
    return false;
  }
  return new Promise<boolean>((resolve, reject) => {
    let finished = false;
    const cleanup = () => {
      finished = true;
      clearInterval(timer);
      clearTimeout(timeout);
      window.removeEventListener('message', receive);
    };
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== popup ||
        event.data?.type !== 'utilint:complete'
      ) {
        return;
      }
      cleanup();
      popup.close();
      if (event.data.status === 'connected') {
        resolve(true);
      } else {
        reject(new Error('Connection was cancelled or expired. Try again.'));
      }
    };
    const timer = setInterval(() => {
      if (popup.closed && !finished) {
        cleanup();
        reject(new Error('Connection window closed. Try again.'));
      }
    }, 500);
    const timeout = setTimeout(() => {
      cleanup();
      popup.close();
      reject(new Error('Connection expired. Try again.'));
    }, 600000);
    window.addEventListener('message', receive);
    popup.location.replace(url);
  });
}
