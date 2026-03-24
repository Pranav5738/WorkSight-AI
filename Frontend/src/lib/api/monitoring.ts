import { http } from './http';

export type MonitoringAlert = {
  ts: number;
  employee_id?: string | null;
  track_id?: number | null;
  state: 'idle' | 'away' | string;
  duration_sec: number;
  message?: string;
};

export type MonitoringStatus = {
  enabled: boolean;
  running?: boolean;
  alerts?: MonitoringAlert[];
  config?: { video_source?: string | number | null; demo_fps?: number };
};

export async function getMonitoringStatus(): Promise<MonitoringStatus> {
  return http('/monitoring/status');
}

export async function startMonitoring(): Promise<{ running: boolean }> {
  return http('/monitoring/start', { method: 'POST' });
}

export async function stopMonitoring(): Promise<{ running: boolean }> {
  return http('/monitoring/stop', { method: 'POST' });
}

export async function startMonitoringDemo(opts?: { pattern?: string; fps?: number; idle_sec?: number; away_sec?: number }): Promise<{ running: boolean; demo?: boolean }> {
  const body: any = {};
  if (opts?.pattern) body.pattern = opts.pattern;
  if (typeof opts?.fps === 'number') body.fps = opts.fps;
  if (typeof opts?.idle_sec === 'number') body.idle_sec = opts.idle_sec;
  if (typeof opts?.away_sec === 'number') body.away_sec = opts.away_sec;
  return http('/monitoring/demo/start', { method: 'POST', body });
}

export type ProductivityTotals = Record<string, { working_sec: number; idle_sec: number; away_sec: number; sleeping_sec: number; idle_min?: number; away_min?: number; deduction?: number }>;

export async function getMonitoringSummary(date?: string): Promise<{ date: string; totals: ProductivityTotals }> {
  const url = date ? `/monitoring/summary?date=${encodeURIComponent(date)}` : '/monitoring/summary';
  return http(url);
}

export async function getMonitoringDeductions(policy: { idle_minutes: number; idle_deduction: number; away_minutes: number; away_deduction: number }): Promise<{ policy: any; totals: ProductivityTotals }> {
  return http('/monitoring/deductions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(policy) });
}

export async function downloadMonitoringSummaryCsv(date?: string): Promise<Blob> {
  const url = date ? `/monitoring/summary.csv?date=${encodeURIComponent(date)}` : '/monitoring/summary.csv';
  // Use fetch directly to get Blob
  const res = await fetch(import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}${url}` : url, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to download CSV');
  return await res.blob();
}

export async function getMonitoringPolicy(): Promise<{ policy: Record<string, any> }>{
  return http('/monitoring/policy');
}

export async function setMonitoringPolicy(policy: Record<string, any>): Promise<{ policy: Record<string, any> }>{
  return http('/monitoring/policy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(policy) });
}
