/**
 * netInfo.ts - Estado de red para decidir si drenamos sync_queue.
 */
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";

let _currentState: NetInfoState | null = null;
const listeners = new Set<(online: boolean) => void>();

NetInfo.addEventListener((state) => {
  _currentState = state;
  const online = Boolean(state.isConnected && state.isInternetReachable);
  for (const l of listeners) l(online);
});

export function isOnline(): boolean {
  if (!_currentState) return false;
  return Boolean(_currentState.isConnected && _currentState.isInternetReachable);
}

export function onConnectivityChange(cb: (online: boolean) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
