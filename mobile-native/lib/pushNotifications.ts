/**
 * Expo push notifications: permission, token, and backend registration.
 * Register with platform; prefs via GET/POST /api/mobile/push/prefs.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import api from '@/lib/api';

export type PushStatus = {
  permissionGranted: boolean | null;
  tokenRegistered: boolean;
  scheduleEnabled: boolean;
  tasksEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
};

/**
 * Request notification permission and return whether granted.
 */
export async function requestPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Get current permission status (granted / denied / undetermined).
 */
export async function getPermissionStatus(): Promise<boolean | null> {
  if (Platform.OS === 'web') return null;
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;
  if (status === 'denied') return false;
  return null;
}

/**
 * Get Expo push token only if permission already granted (does not request).
 */
export async function getExpoPushTokenIfGranted(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return null;
  const projectId = (await import('expo-constants')).default.expoConfig?.extra?.eas?.projectId;
  const tokenResult = await Notifications.getExpoPushTokenAsync({
    projectId: projectId ?? undefined,
  });
  return tokenResult?.data ?? null;
}

/**
 * Get Expo push token. Requests permission if needed. Returns null on web or if permission denied.
 */
export async function getExpoPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const granted = await requestPermission();
  if (!granted) return null;
  return await getExpoPushTokenIfGranted();
}

/**
 * Register the current device's push token with the backend.
 * Body: expoPushToken, platform ("ios"|"android"), deviceHint?, appVersion?
 */
export async function registerPushToken(options?: {
  deviceHint?: string;
  appVersion?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const token = await getExpoPushToken();
  if (!token) {
    return { ok: false, error: 'Permission denied or could not get token' };
  }
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  try {
    await api.post('/api/mobile/push/register', {
      expoPushToken: token,
      platform,
      deviceHint: options?.deviceHint ?? 'mobile-native',
      ...(options?.appVersion != null && { appVersion: options.appVersion }),
    });
    return { ok: true };
  } catch (e: unknown) {
    const message =
      e && typeof e === 'object' && 'response' in e
        ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
        : 'Request failed';
    return { ok: false, error: message ?? 'Request failed' };
  }
}

/**
 * Send a test push via POST /api/mobile/push/test.
 */
export async function sendTestPush(): Promise<{
  ok: boolean;
  sent?: number;
  reason?: string;
  error?: string;
}> {
  try {
    const { data } = await api.post<{ ok: boolean; sent?: number; reason?: string }>(
      '/api/mobile/push/test'
    );
    return {
      ok: data.ok === true,
      sent: data.sent,
      reason: data.reason,
    };
  } catch (e: unknown) {
    const message =
      e && typeof e === 'object' && 'response' in e
        ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
        : 'Request failed';
    return { ok: false, error: message ?? 'Request failed' };
  }
}

/**
 * Fetch current push registration status and preferences from GET /api/mobile/push/prefs.
 */
export async function fetchPushStatus(): Promise<PushStatus | null> {
  try {
    const permissionGranted = await getPermissionStatus();
    const { data } = await api.get<{
      registered: boolean;
      tokenCount: number;
      scheduleEnabled: boolean;
      tasksEnabled: boolean;
      quietHoursStart: string | null;
      quietHoursEnd: string | null;
    }>('/api/mobile/push/prefs');
    return {
      permissionGranted,
      tokenRegistered: data.registered && data.tokenCount > 0,
      scheduleEnabled: data.scheduleEnabled,
      tasksEnabled: data.tasksEnabled,
      quietHoursStart: data.quietHoursStart ?? null,
      quietHoursEnd: data.quietHoursEnd ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Update notification preferences via POST /api/mobile/push/prefs.
 */
export async function updatePushPreferences(prefs: {
  scheduleEnabled?: boolean;
  tasksEnabled?: boolean;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await api.post('/api/mobile/push/prefs', {
      ...(prefs.scheduleEnabled !== undefined && { scheduleEnabled: prefs.scheduleEnabled }),
      ...(prefs.tasksEnabled !== undefined && { tasksEnabled: prefs.tasksEnabled }),
      ...(prefs.quietHoursStart !== undefined && { quietHoursStart: prefs.quietHoursStart ?? null }),
      ...(prefs.quietHoursEnd !== undefined && { quietHoursEnd: prefs.quietHoursEnd ?? null }),
    });
    return { ok: true };
  } catch (e: unknown) {
    const message =
      e && typeof e === 'object' && 'response' in e
        ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
        : 'Request failed';
    return { ok: false, error: message ?? 'Request failed' };
  }
}
