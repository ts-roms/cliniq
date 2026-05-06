import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import {
  notificationsControllerRegisterPushToken,
  notificationsControllerUnregisterPushToken,
} from '@org/api-client';
import { useSession } from '../auth/use-session';

const DEVICE_ID_KEY = 'cliniq.deviceId';
let cachedDeviceId: string | null = null;

/**
 * Stable per-install device id — generated once and persisted in SecureStore.
 * The api uses (userId, deviceId) as the natural key for `push_tokens` so a
 * single user can have multiple devices without overwriting each other.
 */
async function getOrCreateDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) {
    cachedDeviceId = existing;
    return existing;
  }
  // Avoid a uuid dep — `Math.random` is fine for an opaque local id.
  const fresh =
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2, 10) +
    '-' +
    Math.random().toString(36).slice(2, 10);
  await SecureStore.setItemAsync(DEVICE_ID_KEY, fresh);
  cachedDeviceId = fresh;
  return fresh;
}

/**
 * Foreground handler: when a push arrives while the app is open, show the
 * banner + play the sound (Expo would otherwise swallow it). Set once at
 * module load — Notifications.setNotificationHandler is global.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Mounts at the root (after login). Requests notification permission, gets
 * the Expo push token, and registers it with the api. Unregisters on logout.
 *
 * Best-effort end-to-end: any failure is logged and swallowed so a notification
 * permission denial never blocks the app from working.
 */
export function usePushNotifications() {
  const session = useSession();
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const userId = session?.user.id ?? null;

    // Logged out — unregister the device's token if we previously had one.
    if (!userId) {
      const prev = userIdRef.current;
      if (prev) {
        userIdRef.current = null;
        void (async () => {
          try {
            const deviceId = await getOrCreateDeviceId();
            await notificationsControllerUnregisterPushToken({ body: { deviceId } });
          } catch {
            // ignore — token will get reaped server-side on next push if invalid
          }
        })();
      }
      return;
    }

    // Don't re-register on every render — only when the user changes.
    if (userIdRef.current === userId) return;
    userIdRef.current = userId;

    void (async () => {
      try {
        if (!Device.isDevice) {
          // Push doesn't work on simulators; skip silently.
          return;
        }
        const settings = await Notifications.getPermissionsAsync();
        let status = settings.status;
        if (status !== 'granted') {
          const req = await Notifications.requestPermissionsAsync();
          status = req.status;
        }
        if (status !== 'granted') return;

        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.DEFAULT,
            sound: 'default',
          });
        }

        const projectId =
          process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
          // Older Expo configs put it under expoConfig.extra.eas.projectId at
          // runtime; we read from env to keep this hook decoupled from app.json.
          undefined;
        const tokenResult = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        );
        const token = tokenResult.data;
        if (!token) return;

        if (cancelled) return;
        const deviceId = await getOrCreateDeviceId();
        await notificationsControllerRegisterPushToken({
          body: {
            deviceId,
            token,
            platform:
              Platform.OS === 'ios'
                ? 'ios'
                : Platform.OS === 'android'
                  ? 'android'
                  : Platform.OS === 'web'
                    ? 'web'
                    : 'unknown',
          },
        });
      } catch (err) {
        // Permission denial, no project id, no network — all fine.
        // eslint-disable-next-line no-console
        console.warn('[push] register failed', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.user.id]);
}
