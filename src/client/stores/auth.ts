/**
 * Authentication Store
 *
 * FIXES:
 * - Refresh token support
 * - Proper TypeScript types
 * - Secure token storage
 * - Token expiration tracking
 */

import { writable } from 'svelte/store';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'OPERATOR' | 'VIEWER';
}

interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  tokenExpiry: number | null; // Unix timestamp
}

// Load initial state from localStorage
const initialState: AuthState = {
  isAuthenticated: !!localStorage.getItem('token'),
  token: localStorage.getItem('token'),
  refreshToken: localStorage.getItem('refreshToken'),
  user: localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!) : null,
  tokenExpiry: localStorage.getItem('tokenExpiry') ? parseInt(localStorage.getItem('tokenExpiry')!) : null
};

export const authStore = writable<AuthState>(initialState);

/**
 * Login with access and refresh tokens
 */
export const login = (accessToken: string, refreshToken: string, user: User) => {
  // Access tokens expire in 15 minutes (as per server config)
  const tokenExpiry = Date.now() + 15 * 60 * 1000; // 15 minutes from now

  localStorage.setItem('token', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
  localStorage.setItem('user', JSON.stringify(user));
  localStorage.setItem('tokenExpiry', tokenExpiry.toString());

  authStore.set({
    isAuthenticated: true,
    token: accessToken,
    refreshToken,
    user,
    tokenExpiry
  });
};

/**
 * Update tokens (for refresh)
 */
export const updateTokens = (accessToken: string, refreshToken: string) => {
  const tokenExpiry = Date.now() + 15 * 60 * 1000;

  localStorage.setItem('token', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
  localStorage.setItem('tokenExpiry', tokenExpiry.toString());

  authStore.update(state => ({
    ...state,
    token: accessToken,
    refreshToken,
    tokenExpiry
  }));
};

/**
 * Logout and clear all auth data
 */
export const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  localStorage.removeItem('tokenExpiry');

  authStore.set({
    isAuthenticated: false,
    token: null,
    refreshToken: null,
    user: null,
    tokenExpiry: null
  });
};

/**
 * Check if token is expired or about to expire (within 1 minute)
 */
export const isTokenExpired = (state: AuthState): boolean => {
  if (!state.tokenExpiry) return true;
  // Consider expired if less than 1 minute remaining
  return Date.now() >= state.tokenExpiry - 60000;
};
