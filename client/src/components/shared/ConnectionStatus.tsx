import { useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { useSignalRStatus } from '../../hooks/useSignalRStatus';

export function ConnectionStatus() {
  const status = useSignalRStatus();
  const [showReconnected, setShowReconnected] = useState(false);
  const hadDisconnect = useRef(false);

  useEffect(() => {
    if (status !== 'connected') {
      hadDisconnect.current = true;
      setShowReconnected(false);
    } else if (hadDisconnect.current) {
      setShowReconnected(true);
      const t = setTimeout(() => setShowReconnected(false), 2500);
      return () => clearTimeout(t);
    }
  }, [status]);

  if (status === 'connected' && !showReconnected) return null;

  if (showReconnected) {
    return (
      <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 px-4 py-1.5 bg-green-500 dark:bg-green-600 text-white text-sm font-medium">
        <Wifi size={14} />
        Reconnected
      </div>
    );
  }

  return (
    <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 px-4 py-1.5 bg-amber-500 dark:bg-amber-600 text-white text-sm font-medium">
      <WifiOff size={14} />
      {status === 'connecting' ? 'Reconnecting…' : 'Connection lost — reconnecting…'}
    </div>
  );
}
