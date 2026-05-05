import { useEffect, useSyncExternalStore } from 'react';
import { translate, type Lang } from './dict';
import {
  getLang,
  hydrateLang,
  isLangHydrated,
  subscribeLang,
} from './store';

export function useT(): (key: string) => string {
  const lang = useSyncExternalStore(subscribeLang, getLang, () => 'en' as Lang);
  // One-shot hydration. Cheap to call: hydrateLang() short-circuits on hydrated.
  useEffect(() => {
    if (!isLangHydrated()) void hydrateLang();
  }, []);
  return (key: string) => translate(lang, key);
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribeLang, getLang, () => 'en' as Lang);
}
