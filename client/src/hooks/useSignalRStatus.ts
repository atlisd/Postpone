import { useEffect, useState } from 'react';
import { subscribeToStatus, getCurrentStatus, type ConnectionStatus } from '../lib/signalr';

export function useSignalRStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(getCurrentStatus);
  useEffect(() => subscribeToStatus(setStatus), []);
  return status;
}
