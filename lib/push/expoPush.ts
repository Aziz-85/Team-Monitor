/**
 * Send push notifications via Expo Push API.
 * Chunks to 100, logs errors without throwing.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK_SIZE = 100;

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export async function sendExpoPush(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) return;
  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    const chunk = messages.slice(i, i + CHUNK_SIZE);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk.length === 1 ? chunk[0] : chunk),
      });
      if (!res.ok) {
        console.warn('[Push] Expo API error', res.status, await res.text());
      }
    } catch (e) {
      console.warn('[Push] Expo send failed', e);
    }
  }
}
