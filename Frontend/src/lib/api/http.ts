// Generic HTTP helper for backend integration
// Adjust endpoints in individual modules if your backend uses different routes.

const API_URL = import.meta.env.VITE_API_URL as string | undefined;

// Lightweight global error listeners (e.g., for banner UI)
type BackendErrorListener = (error: { message: string; status?: number }) => void;
const backendErrorListeners = new Set<BackendErrorListener>();
export function onBackendError(cb: BackendErrorListener) { backendErrorListeners.add(cb); return () => backendErrorListeners.delete(cb); }
function emitBackendError(err: { message: string; status?: number }) { backendErrorListeners.forEach(l => l(err)); }

// Token storage helpers (access + refresh) used by auth context
export function storeTokens(tokens: { access_token: string; refresh_token?: string; expires_in?: number }) {
  localStorage.setItem('auth_token', tokens.access_token);
  if (tokens.refresh_token) localStorage.setItem('refresh_token', tokens.refresh_token);
  if (tokens.expires_in) localStorage.setItem('token_exp', (Date.now() + tokens.expires_in * 1000 - 5000).toString());
}
export function clearTokens() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('token_exp');
}
export function getAccessToken() { return localStorage.getItem('auth_token'); }
export function getRefreshToken() { return localStorage.getItem('refresh_token'); }
export function tokenNeedsRefresh() {
  const exp = localStorage.getItem('token_exp');
  if (!exp) return false;
  return Date.now() > parseInt(exp);
}

let refreshInFlight: Promise<boolean> | null = null;
async function attemptRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(normalize(`${API_URL}/auth/refresh`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      if (!res.ok) return false;
      const json: any = await res.json();
      if (json.access_token) {
        storeTokens(json);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export function isBackendConfigured(): boolean {
  return !!API_URL;
}

interface HttpOptions extends RequestInit {
  parseJson?: boolean;
  // If true, do not emit global backend error events for non-OK responses
  suppressErrorEmit?: boolean;
  // If provided, suppress emit only for these status codes (e.g., [404])
  suppressStatuses?: number[];
}

export async function http<T = any>(path: string, options: HttpOptions = {}): Promise<T> {
  if (!API_URL) throw new Error('Backend API URL (VITE_API_URL) not configured');
  const { parseJson = true, headers, suppressErrorEmit, suppressStatuses, ...rest } = options;
  const token = typeof window !== 'undefined' ? getAccessToken() : null;

  const attempt = async (): Promise<Response> => {
    return fetch(normalize(`${API_URL}${path}`), {
      headers: {
        ...(parseJson ? { 'Accept': 'application/json' } : {}),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(headers || {})
      },
      ...rest
    });
  };

  let res: Response;
  try {
    res = await attempt();
  } catch (e) {
    // Network error – single retry
    res = await attempt();
  }
  if (!res.ok) {
    // Attempt refresh on 401 once
    if (res.status === 401) {
      const refreshed = await attemptRefresh();
      if (refreshed) {
        const retry = await attempt();
        if (retry.ok) return parseJson ? (retry.json() as Promise<T>) : (undefined as unknown as T);
        if (retry.status === 401) clearTokens();
        const textR = await retry.text().catch(() => '');
        if (!(suppressErrorEmit && (!suppressStatuses || suppressStatuses.includes(retry.status)))) {
          emitBackendError({ message: textR || `HTTP ${retry.status}`, status: retry.status });
        }
        throw new Error(textR || `HTTP ${retry.status}`);
      }
      clearTokens();
    }
    // Retry on transient 502/503 once
    if ([502, 503].includes(res.status)) {
      const retry = await attempt();
      if (retry.ok) {
        return parseJson ? (retry.json() as Promise<T>) : (undefined as unknown as T);
      }
      const text = await retry.text().catch(() => '');
      if (!(suppressErrorEmit && (!suppressStatuses || suppressStatuses.includes(retry.status)))) {
        emitBackendError({ message: text || `HTTP ${retry.status}`, status: retry.status });
      }
      throw new Error(text || `HTTP ${retry.status}`);
    }
    const text = await res.text().catch(() => '');
    if (!(suppressErrorEmit && (!suppressStatuses || suppressStatuses.includes(res.status)))) {
      emitBackendError({ message: text || `HTTP ${res.status}`, status: res.status });
    }
    throw new Error(text || `HTTP ${res.status}`);
  }
  return parseJson ? (res.json() as Promise<T>) : (undefined as unknown as T);
}

function normalize(url: string) {
  return url.replace(/(?<!:)\/+/g, '/').replace(':/', '://');
}

export function base64ToFile(dataUrl: string, filename: string): File {
  const [meta, base64] = dataUrl.split(',');
  const mimeMatch = /data:(.*?);base64/.exec(meta || '');
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new File([arr], filename, { type: mime });
}
