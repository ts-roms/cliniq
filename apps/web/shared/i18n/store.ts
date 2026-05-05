// Simple language store. localStorage-backed + cross-tab sync via the storage
// event. useSyncExternalStore so any component re-renders when the language
// changes — no context provider needed.

import { DEFAULT_LANG, type Lang } from './dict';

const KEY = 'cliniq.lang';
const EVENT = 'cliniq:lang';

let cached: Lang | undefined; // undefined = not yet read

function read(): Lang {
  if (typeof window === 'undefined') return DEFAULT_LANG;
  const raw = window.localStorage.getItem(KEY);
  return raw === 'ph' || raw === 'en' ? raw : DEFAULT_LANG;
}

export function getLang(): Lang {
  if (cached === undefined) cached = read();
  return cached;
}

export function setLang(next: Lang): void {
  if (typeof window === 'undefined') return;
  cached = next;
  window.localStorage.setItem(KEY, next);
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function subscribeLang(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = () => {
    cached = read();
    cb();
  };
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
