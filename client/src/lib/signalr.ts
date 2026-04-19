import { HubConnectionBuilder, HubConnection, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { getAccessToken } from '../api/client';

type SyncCallback = () => void;
export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

const SYNC_EVENTS = [
  'TaskCreated', 'TaskUpdated', 'TaskDeleted',
  'SubtaskUpdated',
  'ProjectUpdated', 'ProjectCreated', 'ProjectDeleted',
  'FolderCreated', 'FolderUpdated', 'FolderDeleted',
];

let connection: HubConnection | null = null;
const subscribers = new Set<SyncCallback>();
let retryTimeout: ReturnType<typeof setTimeout> | null = null;

const statusSubscribers = new Set<(s: ConnectionStatus) => void>();
let currentStatus: ConnectionStatus = 'disconnected';

function setStatus(next: ConnectionStatus) {
  if (next === currentStatus) return;
  currentStatus = next;
  for (const cb of statusSubscribers) cb(next);
}

export function subscribeToStatus(cb: (s: ConnectionStatus) => void): () => void {
  statusSubscribers.add(cb);
  cb(currentStatus);
  return () => statusSubscribers.delete(cb);
}

export function getCurrentStatus(): ConnectionStatus {
  return currentStatus;
}

function notifyAllSubscribers() {
  for (const cb of subscribers) cb();
}

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
      connection.on(event, notifyAllSubscribers);
    }

    connection.onreconnecting(() => setStatus('connecting'));
    connection.onreconnected(() => {
      setStatus('connected');
      notifyAllSubscribers();
    });
    connection.onclose(() => {
      setStatus('disconnected');
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

  setStatus('connecting');
  conn.start()
    .then(() => {
      setStatus('connected');
      notifyAllSubscribers();
    })
    .catch(() => {
      setStatus('disconnected');
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

let visibilityListenerRegistered = false;

export function subscribe(callback: SyncCallback): () => void {
  subscribers.add(callback);

  if (!visibilityListenerRegistered) {
    visibilityListenerRegistered = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (subscribers.size === 0) return;
      const conn = getConnection();
      if (conn.state === HubConnectionState.Connected) {
        notifyAllSubscribers();
      } else if (conn.state === HubConnectionState.Disconnected) {
        if (retryTimeout) { clearTimeout(retryTimeout); retryTimeout = null; }
        startConnection();
      }
      // If Connecting/Reconnecting: onreconnected will fire and call notifyAllSubscribers
    });
  }

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
