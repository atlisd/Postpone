import { useState, useEffect } from 'react';
import { subscribeToStatus, type ConnectionStatus } from '../lib/signalr';

export function useSignalRStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  useEffect(() => subscribeToStatus(setStatus), []);
  return status;
}
