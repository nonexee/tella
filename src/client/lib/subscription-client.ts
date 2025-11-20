/**
 * GraphQL Subscription Client using graphql-ws
 *
 * Provides real-time updates via WebSocket subscriptions
 */

import { createClient, Client, SubscribePayload } from 'graphql-ws';
import { authStore } from '../stores/auth';
import { get } from 'svelte/store';

const WS_ENDPOINT = (import.meta as any).env?.VITE_WS_ENDPOINT ||
  'ws://localhost:4000/graphql';

let client: Client | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 2000;

/**
 * Get or create the WebSocket client
 */
export function getSubscriptionClient(): Client {
  if (client) {
    return client;
  }

  const auth = get(authStore);

  client = createClient({
    url: WS_ENDPOINT,
    connectionParams: () => {
      const currentAuth = get(authStore);
      if (currentAuth.token) {
        return {
          authorization: `Bearer ${currentAuth.token}`,
        };
      }
      return {};
    },
    retryAttempts: MAX_RECONNECT_ATTEMPTS,
    shouldRetry: () => reconnectAttempts < MAX_RECONNECT_ATTEMPTS,
    on: {
      connected: () => {
        console.log('[WebSocket] Connected to GraphQL subscriptions');
        reconnectAttempts = 0;
      },
      closed: (event) => {
        console.log('[WebSocket] Connection closed', event);
      },
      error: (error) => {
        console.error('[WebSocket] Connection error:', error);
        reconnectAttempts++;
      },
    },
  });

  return client;
}

/**
 * Close and cleanup the WebSocket client
 */
export function closeSubscriptionClient(): void {
  if (client) {
    client.dispose();
    client = null;
    reconnectAttempts = 0;
  }
}

/**
 * Subscribe to a GraphQL subscription
 *
 * @param payload - GraphQL subscription payload
 * @param handlers - Event handlers for subscription events
 * @returns Unsubscribe function
 */
export function subscribe<T = any>(
  payload: SubscribePayload,
  handlers: {
    onNext: (value: T) => void;
    onError?: (error: any) => void;
    onComplete?: () => void;
  }
): () => void {
  const client = getSubscriptionClient();

  const unsubscribe = client.subscribe<T>(payload, {
    next: (result) => {
      if (result.errors) {
        handlers.onError?.(result.errors);
        return;
      }
      if (result.data) {
        handlers.onNext(result.data);
      }
    },
    error: (error) => {
      console.error('[Subscription] Error:', error);
      handlers.onError?.(error);
    },
    complete: () => {
      console.log('[Subscription] Completed');
      handlers.onComplete?.();
    },
  });

  return unsubscribe;
}

/**
 * Subscribe to scan updates
 */
export function subscribeScanUpdated(
  scanId: string,
  onUpdate: (scan: any) => void,
  onError?: (error: any) => void
): () => void {
  return subscribe(
    {
      query: `
        subscription ScanUpdated($scanId: ID!) {
          scanUpdated(scanId: $scanId) {
            id
            name
            status
            progress
            startedAt
            completedAt
            findings {
              id
              severity
            }
            agents {
              id
              role
              status
            }
          }
        }
      `,
      variables: { scanId },
    },
    {
      onNext: (data: any) => {
        onUpdate(data.scanUpdated);
      },
      onError,
    }
  );
}

/**
 * Subscribe to scan progress updates
 */
export function subscribeScanProgress(
  scanId: string,
  onProgress: (progress: any) => void,
  onError?: (error: any) => void
): () => void {
  return subscribe(
    {
      query: `
        subscription ScanProgress($scanId: ID!) {
          scanProgress(scanId: $scanId) {
            scanId
            percentage
            currentPhase
            message
            timestamp
          }
        }
      `,
      variables: { scanId },
    },
    {
      onNext: (data: any) => {
        onProgress(data.scanProgress);
      },
      onError,
    }
  );
}

/**
 * Subscribe to agent status changes
 */
export function subscribeAgentStatus(
  agentId: string | null,
  onStatusChange: (update: any) => void,
  onError?: (error: any) => void
): () => void {
  return subscribe(
    {
      query: `
        subscription AgentStatusChanged($agentId: ID) {
          agentStatusChanged(agentId: $agentId) {
            agentId
            status
            message
            timestamp
          }
        }
      `,
      variables: agentId ? { agentId } : {},
    },
    {
      onNext: (data: any) => {
        onStatusChange(data.agentStatusChanged);
      },
      onError,
    }
  );
}

/**
 * Subscribe to agent thinking events
 */
export function subscribeAgentThinking(
  agentId: string,
  onThought: (thought: any) => void,
  onError?: (error: any) => void
): () => void {
  return subscribe(
    {
      query: `
        subscription AgentThinking($agentId: ID!) {
          agentThinking(agentId: $agentId) {
            agentId
            thought
            reasoning
            timestamp
          }
        }
      `,
      variables: { agentId },
    },
    {
      onNext: (data: any) => {
        onThought(data.agentThinking);
      },
      onError,
    }
  );
}

/**
 * Subscribe to task updates
 */
export function subscribeTaskUpdated(
  scanId: string | null,
  onTaskUpdate: (task: any) => void,
  onError?: (error: any) => void
): () => void {
  return subscribe(
    {
      query: `
        subscription TaskUpdated($scanId: ID) {
          taskUpdated(scanId: $scanId) {
            id
            type
            status
            priority
            agent {
              id
              role
            }
            result
            createdAt
            updatedAt
          }
        }
      `,
      variables: scanId ? { scanId } : {},
    },
    {
      onNext: (data: any) => {
        onTaskUpdate(data.taskUpdated);
      },
      onError,
    }
  );
}
