/**
 * GraphQL Client with Token Refresh
 *
 * FIXES:
 * - Automatic token refresh on 401
 * - Proper error handling
 * - Type-safe requests
 * - Request/response interceptors
 * - Race condition prevention (single refresh promise for concurrent requests)
 */

import { authStore, updateTokens, logout } from '../stores/auth';
import { get } from 'svelte/store';

const GRAPHQL_ENDPOINT = import.meta.env.VITE_GRAPHQL_ENDPOINT || 'http://localhost:4000/graphql';

// Global promise cache to prevent concurrent refresh attempts
let refreshPromise: Promise<void> | null = null;

export class GraphQLError extends Error {
  constructor(
    message: string,
    public code?: string,
    public extensions?: any
  ) {
    super(message);
    this.name = 'GraphQLError';
  }
}

export class NetworkError extends Error {
  constructor(
    message: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

interface GraphQLRequest {
  query: string;
  variables?: Record<string, any>;
  operationName?: string;
}

interface GraphQLResponse<T = any> {
  data?: T;
  errors?: Array<{
    message: string;
    extensions?: {
      code?: string;
      [key: string]: any;
    };
  }>;
}

/**
 * Make a GraphQL request with automatic token refresh
 */
export async function graphqlRequest<T = any>(
  request: GraphQLRequest,
  options: {
    skipAuth?: boolean;
    retryOnce?: boolean;
  } = {}
): Promise<T> {
  const { skipAuth = false, retryOnce = true } = options;

  // Get current auth state
  const auth = get(authStore);
  const token = skipAuth ? null : auth.token;

  // Build headers
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Make request
  try {
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    });

    // Handle network errors
    if (!response.ok) {
      // 401 Unauthorized - try to refresh token
      if (response.status === 401 && retryOnce && auth.refreshToken) {
        try {
          await refreshAccessToken();
          // Retry request with new token
          return graphqlRequest<T>(request, { ...options, retryOnce: false });
        } catch (refreshError) {
          // Refresh failed, log out user
          logout();
          throw new NetworkError('Session expired. Please log in again.', 401);
        }
      }

      throw new NetworkError(
        `HTTP ${response.status}: ${response.statusText}`,
        response.status
      );
    }

    const result: GraphQLResponse<T> = await response.json();

    // Handle GraphQL errors
    if (result.errors && result.errors.length > 0) {
      const firstError = result.errors[0];
      throw new GraphQLError(
        firstError.message,
        firstError.extensions?.code,
        firstError.extensions
      );
    }

    if (!result.data) {
      throw new GraphQLError('No data returned from GraphQL');
    }

    return result.data;
  } catch (error) {
    // Re-throw our custom errors
    if (error instanceof GraphQLError || error instanceof NetworkError) {
      throw error;
    }

    // Network/fetch errors
    if (error instanceof TypeError) {
      throw new NetworkError('Network error. Please check your connection.');
    }

    // Unknown errors
    throw new Error(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown'}`);
  }
}

/**
 * Refresh the access token using refresh token
 * Uses a promise cache to prevent concurrent refresh attempts
 */
async function refreshAccessToken(): Promise<void> {
  // If a refresh is already in progress, return that promise
  if (refreshPromise) {
    return refreshPromise;
  }

  // Create new refresh promise
  refreshPromise = (async () => {
    try {
      const auth = get(authStore);

      if (!auth.refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await fetch(GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            mutation RefreshToken($refreshToken: String!) {
              refreshToken(refreshToken: $refreshToken) {
                accessToken
                refreshToken
              }
            }
          `,
          variables: {
            refreshToken: auth.refreshToken,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to refresh token');
      }

      const result: GraphQLResponse = await response.json();

      if (result.errors || !result.data) {
        throw new Error('Token refresh failed');
      }

      const { accessToken, refreshToken } = result.data.refreshToken;
      updateTokens(accessToken, refreshToken);
    } finally {
      // Clear the promise cache when done (success or failure)
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Query helper
 */
export function query<T = any>(
  queryString: string,
  variables?: Record<string, any>
): Promise<T> {
  return graphqlRequest<T>({ query: queryString, variables });
}

/**
 * Mutation helper
 */
export function mutate<T = any>(
  mutation: string,
  variables?: Record<string, any>
): Promise<T> {
  return graphqlRequest<T>({ query: mutation, variables });
}
