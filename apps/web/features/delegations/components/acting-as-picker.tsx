'use client';

import { useSyncExternalStore } from 'react';
import { Select } from '@org/ui';
import { useReceivedDelegations } from '../hooks/use-delegations';
import {
  getActingAs,
  setActingAs,
  subscribeActingAs,
} from '../acting-as';

function useActingAs() {
  return useSyncExternalStore(
    subscribeActingAs,
    () => getActingAs(),
    () => null,
  );
}

/**
 * Dropdown that appears when the current user has at least one active
 * incoming delegation. Selecting a doctor sets a global "acting as" flag —
 * every subsequent API call sends X-Acting-For. When picking "Self", the
 * api-client interceptor drops the header.
 *
 * If a delegation expires while picked, the API will start returning 403 — we
 * trust the periodic re-poll in useReceivedDelegations to catch this and a
 * subsequent render to clear the picker.
 */
export function ActingAsPicker() {
  const acting = useActingAs();
  const received = useReceivedDelegations();
  const list = received.data ?? [];

  if (list.length === 0) {
    // Nothing to act as — also clear stale state if a previously-active
    // delegation just expired or got revoked.
    if (acting) setActingAs(null);
    return null;
  }

  // If the persisted acting-as id is no longer in the active list, drop it.
  const stillValid = list.some((d) => d.delegatorId === acting);
  if (acting && !stillValid) {
    setActingAs(null);
  }

  const value = stillValid ? acting ?? '' : '';
  const isActing = !!value;

  return (
    <div className="flex items-center gap-2">
      <Select
        aria-label="Acting as"
        value={value}
        onChange={(e) => setActingAs(e.target.value || null)}
        className={`h-8 text-xs ${
          isActing ? 'border-amber-500 bg-amber-50 text-amber-900' : ''
        }`}
        title={isActing ? 'You are acting on behalf of someone' : 'Acting as yourself'}
      >
        <option value="">Self</option>
        {list.map((d) => (
          <option key={d.id} value={d.delegatorId}>
            as {d.delegator?.name ?? d.delegatorId} (until{' '}
            {new Date(d.endsAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
            )
          </option>
        ))}
      </Select>
    </div>
  );
}

/**
 * Banner shown across the top of the app when an "acting as" is in effect —
 * clear visual reminder for both the user and anyone looking over their
 * shoulder. Renders nothing when no delegation is active.
 */
export function ActingAsBanner() {
  const acting = useActingAs();
  const received = useReceivedDelegations();
  if (!acting) return null;
  const match = received.data?.find((d) => d.delegatorId === acting);
  if (!match) return null;
  return (
    <div className="border-b border-amber-300 bg-amber-100 px-4 py-1 text-center text-xs text-amber-900 sm:px-6">
      You are acting on behalf of{' '}
      <span className="font-semibold">
        {match.delegator?.name ?? acting}
      </span>{' '}
      until {new Date(match.endsAt).toLocaleString()}.{' '}
      <button
        type="button"
        className="underline hover:no-underline"
        onClick={() => setActingAs(null)}
      >
        Stop acting as
      </button>
    </div>
  );
}
