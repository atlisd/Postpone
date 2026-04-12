import { HubConnectionBuilder, HubConnection, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { getAccessToken } from '../api/client';

type SyncCallback = () => void;

const SYNC_EVENTS = [
  'TaskCreated', 'TaskUpdated', 'TaskDeleted',
  'SubtaskUpdated',
  'ProjectUpdated', 'ProjectCreated', 'ProjectDeleted',
  'FolderCreated', 'FolderUpdated', 'FolderDeleted',
];

let connection: HubConnection | null = null;
const subscribers = new Set<SyncCallback>();
let retryTimeout: ReturnType<typeof setTimeout> | null = null;

function getConnection(): HubConnection {
  if (!connection) {
    connection = new HubConnectionBuilder()
      .withUrl('/hubs/sync', {
        accessTokenFactory: () => getAccessToken() ?? '',
      })
      .withAutomaticReconnect([0, 1000, 2000, 5000, 10000, 30000])
      .configureLogging(LogLevel.Warning)
      .build();

    for (const event of SYNC_EVENTS) {
      connection.on(event, () => {
        for (const cb of subscribers) {
          cb();
        }
      });
    }

    connection.onclose(() => {
      // If there are still subscribers, try to reconnect
      if (subscribers.size > 0) {
        scheduleRetry();
      }
    });
  }
  return connection;
}

function scheduleRetry(delayMs = 5000) {
  if (retryTimeout) return;
  retryTimeout = setTimeout(() => {
    retryTimeout = null;
    startConnection();
  }, delayMs);
}

function startConnection() {
  const conn = getConnection();
  if (conn.state !== HubConnectionState.Disconnected) return;

  conn.start().catch(() => {
    // Retry on failure
    if (subscribers.size > 0) {
      scheduleRetry(10000);
    }
  });
}

function stopConnection() {
  if (retryTimeout) {
    clearTimeout(retryTimeout);
    retryTimeout = null;
  }
  if (connection && connection.state !== HubConnectionState.Disconnected) {
    connection.stop();
  }
}

export function subscribe(callback: SyncCallback): () => void {
  subscribers.add(callback);

  // Start connection on first subscriber
  if (subscribers.size === 1 && getAccessToken()) {
    startConnection();
  }

  return () => {
    subscribers.delete(callback);
    if (subscribers.size === 0) {
      stopConnection();
    }
  };
}
