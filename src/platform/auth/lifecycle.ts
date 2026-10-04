const listeners = new Set<() => void>();
export function invalidateAuthentication() { for (const listener of listeners) listener(); }
export function subscribeAuthentication(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
