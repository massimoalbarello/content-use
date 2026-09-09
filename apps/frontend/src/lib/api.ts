import { treaty } from '@elysiajs/eden';
import type { App } from '@repo/backend/types';
export const api = treaty<App>(window.location.origin).api;
export function unwrap<T>(result: {
  data: T | null;
  error: unknown;
}): Exclude<T, { message: string }> {
  if (result.error) {
    const error = result.error as { value?: { message?: string }; status?: number };
    throw new Error(error.value?.message ?? 'The request failed. Please try again.');
  }
  if (result.data === null) {
    throw new Error('No response from the server.');
  }
  if (typeof result.data === 'object' && 'message' in result.data) {
    throw new Error(String(result.data.message));
  }
  return result.data as Exclude<T, { message: string }>;
}
