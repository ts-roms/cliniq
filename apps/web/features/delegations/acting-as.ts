// Persistent client-side "acting as" toggle. The api-client request
// interceptor reads this to attach X-Acting-For on every request.
//
// Stored in localStorage so it survives reloads. A lightweight pub-sub lets
// useSyncExternalStore subscribe without prop-drilling.

const KEY = 'cliniq.actingAs';
const EVENT = 'cliniq:actingAs';

let cached: string | null | undefined; // undefined = not yet read

function read(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(KEY);
}

export function getActingAs(): string | null {
  if (cached === undefined) cached = read();
  return cached;
}

export function setActingAs(userId: string | null): void {
  if (typeof window === 'undefined') return;
  cached = userId;
  if (userId) window.localStorage.setItem(KEY, userId);
  else window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: userId }));
}

export function subscribeActingAs(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = () => {
    cached = read();
    callback();
  };
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
