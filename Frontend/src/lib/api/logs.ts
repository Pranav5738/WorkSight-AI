import { http, isBackendConfigured } from './http';

export interface SystemLogDTO {
  id?: string;
  created_at?: string;
  event_type: string;
  description: string;
  metadata?: any;
}

type FetchLogsOptions = { eventType?: string; search?: string; since?: string; limit?: number } | string | undefined;

export async function fetchLogs(options?: FetchLogsOptions): Promise<SystemLogDTO[] | null> {
  if (!isBackendConfigured()) return null;
  try {
    const params = new URLSearchParams();
    const opts = typeof options === 'string' ? { eventType: options } : options || {};
    if (opts.eventType && opts.eventType !== 'all') params.set('event_type', opts.eventType);
    if (opts.search) params.set('search', opts.search);
    if (opts.since) params.set('since', opts.since);
    if (opts.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return await http<SystemLogDTO[]>(`/logs${qs ? `?${qs}` : ''}`);
  } catch (e) {
    console.warn('[logs] backend fetch failed, fallback to Supabase', e);
    return null;
  }
}

// Write log (backend first). Returns true if written somewhere.
export async function logEvent(log: Omit<SystemLogDTO, 'id' | 'created_at'>): Promise<boolean> {
  if (isBackendConfigured()) {
    try {
      await http('/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(log)
      });
      return true;
    } catch (e) {
      console.warn('[logs] backend log write failed, will fallback', e);
    }
  }
  // Fallback left to caller (direct Supabase write). Return false to signal fallback needed.
  return false;
}
