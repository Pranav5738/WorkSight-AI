import { http, isBackendConfigured } from './http';

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
}

export interface LoginResponse extends AuthTokens {
  user: { username: string; roles?: string[] };
}

let refreshing: Promise<AuthTokens | null> | null = null;

export function backendAuthEnabled() {
  return isBackendConfigured();
}

export async function loginRequest(username: string, password: string): Promise<LoginResponse> {
  if (!backendAuthEnabled()) throw new Error('Backend auth not enabled');
  return http<LoginResponse>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
}

export async function refreshToken(refresh_token: string): Promise<AuthTokens | null> {
  if (!backendAuthEnabled()) return null;
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const tokens = await http<AuthTokens>('/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token })
      });
      return tokens;
    } catch (e) {
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function logoutRequest(): Promise<void> {
  if (!backendAuthEnabled()) return;
  try {
    await http('/auth/logout', { method: 'POST' });
  } catch {
    // Ignore
  }
}
