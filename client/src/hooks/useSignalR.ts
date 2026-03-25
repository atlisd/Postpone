import { useEffect, useRef } from 'react';
import { HubConnectionBuilder, HubConnection, LogLevel } from '@microsoft/signalr';
import { getAccessToken } from '../api/client';

type EventCallback = () => void;

export function useSignalR(onSync: EventCallback) {
  const connectionRef = useRef<HubConnection | null>(null);
  const callbackRef = useRef(onSync);
  callbackRef.current = onSync;

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;

    const connection = new HubConnectionBuilder()
      .withUrl('/hubs/sync', {
        accessTokenFactory: () => getAccessToken() ?? '',
      })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();

    connectionRef.current = connection;

    const events = ['TaskCreated', 'TaskUpdated', 'TaskDeleted', 'SubtaskUpdated', 'ProjectUpdated'];
    for (const event of events) {
      connection.on(event, () => {
        callbackRef.current();
      });
    }

    connection.start().catch((err) => {
      console.warn('SignalR connection failed:', err);
    });

    return () => {
      connection.stop();
    };
  }, []);

  return connectionRef;
}
