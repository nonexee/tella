import { writable } from 'svelte/store';

interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  user: any | null;
}

const initialState: AuthState = {
  isAuthenticated: false,
  token: localStorage.getItem('token'),
  user: null
};

export const authStore = writable<AuthState>(initialState);

export const login = (token: string, user: any) => {
  localStorage.setItem('token', token);
  authStore.set({
    isAuthenticated: true,
    token,
    user
  });
};

export const logout = () => {
  localStorage.removeItem('token');
  authStore.set({
    isAuthenticated: false,
    token: null,
    user: null
  });
};
