import { useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { useSignalRStatus } from '../../hooks/useSignalRStatus';

export function ConnectionStatus() {
  const status = useSignalRStatus();
  const [showReconnected, setShowReconnected] = useState(false);
  // State (not ref) because render suppresses the amber banner until this flips.
  const [hasBeenConnected, setHasBeenConnected] = useState(false);
  const hadLostConnection = useRef(false);

  useEffect(() => {
    if (status === 'connected') {
      if (hadLostConnection.current) {
        hadLostConnection.current = false;
        setShowReconnected(true);
        const t = setTimeout(() => setShowReconnected(false), 2500);
        return () => clearTimeout(t);
      }
      setHasBeenConnected(true);
    } else if (hasBeenConnected) {
      hadLostConnection.current = true;
      setShowReconnected(false);
    }
  }, [status, hasBeenConnected]);

  if (status === 'connected' && !showReconnected) return null;
  // Before we've ever connected, suppress the "Connection lost" banner — a slow
  // initial connect otherwise flashes it on every page load.
  if (!hasBeenConnected && !showReconnected) return null;

  if (showReconnected) {
    return (
      <div className="fixed bottom-0 inset-x-0 z-50 flex items-center justify-center gap-2 px-4 py-1.5 bg-green-500 dark:bg-green-600 text-white text-sm font-medium">
        <Wifi size={14} />
        Reconnected
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 flex items-center justify-center gap-2 px-4 py-1.5 bg-amber-500 dark:bg-amber-600 text-white text-sm font-medium">
      <WifiOff size={14} />
      {status === 'connecting' ? 'Reconnecting…' : 'Connection lost — reconnecting…'}
    </div>
  );
}
