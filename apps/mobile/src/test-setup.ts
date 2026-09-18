// Test setup for the mobile (Expo) app. The App.spec smoke test renders the
// full <App /> tree, which transitively pulls in several Expo modules that
// require explicit mocking under jest — most ship a `mock.tsx` companion in
// their package, but a couple need manual stubs.

jest.mock('expo/src/winter/ImportMetaRegistry', () => ({
  ImportMetaRegistry: {
    get url() {
      return null;
    },
  },
}));

if (typeof global.structuredClone === 'undefined') {
  global.structuredClone = (object) => JSON.parse(JSON.stringify(object));
}

// @react-native-async-storage/async-storage: use-t.ts persists the language
// here. The native module is null under jest, so wire the in-memory mock
// the package ships for exactly this purpose.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// ── Expo module stubs ────────────────────────────────
// expo-notifications: the App's usePushNotifications hook calls these on
// mount. The real implementations require a Native bridge that's absent in
// jest. Returning safe no-ops keeps the mount happy.
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({
    status: 'undetermined',
    granted: false,
  })),
  requestPermissionsAsync: jest.fn(async () => ({
    status: 'denied',
    granted: false,
  })),
  getExpoPushTokenAsync: jest.fn(async () => ({
    data: 'ExponentPushToken[test]',
  })),
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({
    remove: jest.fn(),
  })),
  removeNotificationSubscription: jest.fn(),
  AndroidImportance: { DEFAULT: 3, HIGH: 4, MAX: 5 },
  setNotificationChannelAsync: jest.fn(async () => undefined),
}));

// expo-secure-store: session.ts persists tokens here. Back it with an
// in-memory map so getSession/saveSession/clearSession behave consistently
// within a single test run.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

// expo-device: used to detect physical-device vs simulator for push setup.
// We always claim simulator so the push registration short-circuits.
jest.mock('expo-device', () => ({
  isDevice: false,
  brand: 'jest',
  manufacturer: 'jest',
  modelName: 'jest',
}));
