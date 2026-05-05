'use client';

import { useSyncExternalStore } from 'react';

/**
 * Returns seconds elapsed since `start`, ticking every second. One global
 * 1-second interval drives every consumer — cheaper than a per-component
 * setInterval inside useEffect.
 */
let now = Date.now();
const subscribers = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function ensureTimer() {
  if (timer || subscribers.size === 0) return;
  timer = setInterval(() => {
    now = Date.now();
    subscribers.forEach((fn) => fn());
  }, 1000);
}

function subscribe(callback: () => void) {
  subscribers.add(callback);
  ensureTimer();
  return () => {
    subscribers.delete(callback);
    if (subscribers.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getNow = () => now;
const getServerNow = () => 0;

export function useElapsedSeconds(startIso: string | null | undefined): number {
  const current = useSyncExternalStore(subscribe, getNow, getServerNow);
  if (!startIso) return 0;
  return Math.max(0, Math.floor((current - new Date(startIso).getTime()) / 1000));
}

export function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
