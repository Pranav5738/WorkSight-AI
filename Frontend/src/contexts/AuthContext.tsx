import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { isBackendConfigured, storeTokens, clearTokens, onBackendError, getAccessToken } from '../lib/api/http';
import { loginRequest, logoutRequest } from '../lib/api/auth';
import { logEvent } from '../lib/api/logs';
import type { Database } from '../types/database';

type SystemLogInsert = Database['public']['Tables']['system_logs']['Insert'];

interface AuthContextType {
  isAuthenticated: boolean;
  username: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initial hydration: if backend is configured we require tokens, not just the legacy 'auth' object.
    const storedAuth = localStorage.getItem('auth');
    const token = localStorage.getItem('auth_token');
    const backend = isBackendConfigured();
    if (backend) {
      if (token) {
        // Token present – derive username from legacy 'auth' or leave null until first /auth/me (future enhancement)
        if (storedAuth) {
          try { const data = JSON.parse(storedAuth); setUsername(data.username || null); } catch { /* ignore */ }
        }
        setIsAuthenticated(true);
      } else {
        // Stale frontend-only session: purge so UI forces login
        localStorage.removeItem('auth');
        setIsAuthenticated(false);
        setUsername(null);
      }
    } else if (storedAuth) {
      // Supabase‑only mode original behavior
      try { const data = JSON.parse(storedAuth); setUsername(data.username || null); } catch { /* ignore */ }
      setIsAuthenticated(true);
    }
    setLoading(false);
  }, []);

  // Auto logout if a 401 comes back from backend while we think we're authenticated.
  useEffect(() => {
    const unsubscribe = onBackendError(err => {
      if (err.status === 401 && isBackendConfigured()) {
        // Stale / invalid token: clear and force re‑login silently.
        clearTokens();
        localStorage.removeItem('auth');
        setIsAuthenticated(false);
        setUsername(null);
      }
    });
    return () => { try { unsubscribe(); } catch { /* ignore */ } };
  }, []);

  // Guard against manual localStorage manipulation (poll every 10s for token disappearance)
  useEffect(() => {
    if (!isBackendConfigured()) return;
    const id = setInterval(() => {
      const token = getAccessToken();
      if (!token && isAuthenticated) {
        clearTokens();
        localStorage.removeItem('auth');
        setIsAuthenticated(false);
        setUsername(null);
      }
    }, 10000);
    return () => clearInterval(id);
  }, [isAuthenticated]);

  // Allow overriding demo credentials via environment variables
  const DEMO_USER = import.meta.env.VITE_DEMO_USER || '123';
  const DEMO_PASS = import.meta.env.VITE_DEMO_PASS || '123';

  const login = async (user: string, password: string): Promise<boolean> => {
    const u = user.trim();
    const p = password.trim();

    if (isBackendConfigured()) {
      try {
        const resp = await loginRequest(u, p);
        storeTokens(resp);
        localStorage.setItem('auth', JSON.stringify({ username: resp.user.username }));
        setIsAuthenticated(true);
        setUsername(resp.user.username);
        const wrote = await logEvent({ event_type: 'auth', description: `User ${resp.user.username} logged in` });
        if (!wrote) {
          const loginLog: SystemLogInsert = { event_type: 'auth', description: `User ${resp.user.username} logged in`, metadata: { ts: new Date().toISOString() } };
          await (supabase.from('system_logs') as any).insert(loginLog);
        }
        return true;
      } catch (e) {
        clearTokens();
        localStorage.removeItem('auth');
        setIsAuthenticated(false);
        return false;
      }
    }

    if (u === DEMO_USER && p === DEMO_PASS) {
      const authData = { username: user };
      localStorage.setItem('auth', JSON.stringify(authData));
      setIsAuthenticated(true);
      setUsername(user);
      const wrote = await logEvent({ event_type: 'auth', description: `User ${user} logged in` });
      if (!wrote) {
        const loginLog: SystemLogInsert = { event_type: 'auth', description: `User ${user} logged in`, metadata: { timestamp: new Date().toISOString() } };
        await (supabase.from('system_logs') as any).insert(loginLog);
      }
      return true;
    }

    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[Auth] Invalid credentials attempt', { enteredUser: u });
    }
    return false;
  };

  const logout = async () => {
    if (isBackendConfigured()) {
      await logoutRequest();
      clearTokens();
    }
    if (username) {
      const wrote = await logEvent({ event_type: 'auth', description: `User ${username} logged out` });
      if (!wrote) {
        const logoutLog: SystemLogInsert = { event_type: 'auth', description: `User ${username} logged out`, metadata: { timestamp: new Date().toISOString() } };
        await (supabase.from('system_logs') as any).insert(logoutLog);
      }
    }
    localStorage.removeItem('auth');
    setIsAuthenticated(false);
    setUsername(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, username, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
