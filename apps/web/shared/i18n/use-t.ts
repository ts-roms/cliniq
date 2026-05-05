'use client';

import { useSyncExternalStore } from 'react';
import { translate, type Lang } from './dict';
import { getLang, subscribeLang } from './store';

const SERVER_LANG: Lang = 'en';

/**
 * Returns a `t(key)` function bound to the current language. Re-runs
 * whenever the user changes their language preference.
 */
export function useT(): (key: string) => string {
  const lang = useSyncExternalStore(
    subscribeLang,
    getLang,
    () => SERVER_LANG, // SSR snapshot
  );
  return (key: string) => translate(lang, key);
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribeLang, getLang, () => SERVER_LANG);
}
