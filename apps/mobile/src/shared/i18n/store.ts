import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_LANG, type Lang } from './dict';

// Mirror of the web language store, persisted via AsyncStorage. Same
// hydrate-then-cache pattern as the auth session: synchronous read for
// useSyncExternalStore + an async hydrateLang() called once at app boot.

const KEY = 'cliniq.lang';

let cached: Lang = DEFAULT_LANG;
let hydrated = false;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((cb) => cb());
}

export function getLang(): Lang {
  return cached;
}

export function isLangHydrated(): boolean {
  return hydrated;
}

export async function hydrateLang(): Promise<void> {
  if (hydrated) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw === 'ph' || raw === 'en') cached = raw;
  } catch {
    // ignore — fall back to default
  } finally {
    hydrated = true;
    notify();
  }
}

export function setLang(next: Lang): void {
  cached = next;
  notify();
  void AsyncStorage.setItem(KEY, next).catch(() => undefined);
}

export function subscribeLang(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
