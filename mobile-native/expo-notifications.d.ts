/**
 * Type declaration for expo-notifications when the package's own types are not resolved.
 * Install with: npm install expo-notifications
 */
declare module 'expo-notifications' {
  export interface NotificationPermissionsStatus {
    status: 'undetermined' | 'granted' | 'denied';
    canAskAgain?: boolean;
    expires?: 'never' | number;
    granted?: boolean;
  }

  export interface ExpoPushTokenOptions {
    projectId?: string;
    applicationId?: string;
  }

  export interface ExpoPushToken {
    type: 'expo';
    data: string;
  }

  export function getPermissionsAsync(): Promise<NotificationPermissionsStatus>;
  export function requestPermissionsAsync(): Promise<NotificationPermissionsStatus>;
  export function getExpoPushTokenAsync(
    options?: ExpoPushTokenOptions
  ): Promise<ExpoPushToken>;
  export function addNotificationResponseReceivedListener(
    listener: (response: { notification: { request: { content: { data?: Record<string, unknown> } } } }) => void
  ): { remove: () => void };
}
