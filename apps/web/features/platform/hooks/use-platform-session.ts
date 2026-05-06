'use client';

import { useSyncExternalStore } from 'react';
import {
  loadPlatformSession,
  subscribePlatformSession,
  type PlatformSession,
} from '../session';

const serverSnapshot = (): PlatformSession | null => null;

export function usePlatformSession(): PlatformSession | null {
  return useSyncExternalStore(
    subscribePlatformSession,
    loadPlatformSession,
    serverSnapshot,
  );
}
