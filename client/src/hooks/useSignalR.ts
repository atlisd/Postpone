import { useEffect, useRef } from 'react';
import { subscribe } from '../lib/signalr';

export function useSignalR(onSync: () => void) {
  const callbackRef = useRef(onSync);
  callbackRef.current = onSync;

  useEffect(() => {
    return subscribe(() => callbackRef.current());
  }, []);
}
