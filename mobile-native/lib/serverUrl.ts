import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'serverBaseUrl';
const DEFAULT_BASE_URL = 'https://dhtasks.com';

/**
 * Normalize URL: trim and remove trailing slash.
 */
export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  return trimmed.replace(/\/+$/, '');
}

/**
 * Get stored base URL or default.
 */
export async function getServerBaseUrl(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    const url = stored?.trim() || DEFAULT_BASE_URL;
    return normalizeUrl(url) || DEFAULT_BASE_URL;
  } catch {
    return DEFAULT_BASE_URL;
  }
}

/**
 * Set and persist base URL (expects already normalized if needed).
 */
export async function setServerBaseUrl(url: string): Promise<void> {
  const value = normalizeUrl(url) || DEFAULT_BASE_URL;
  await AsyncStorage.setItem(STORAGE_KEY, value);
}
