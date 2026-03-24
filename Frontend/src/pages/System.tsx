import { useEffect, useState } from 'react';
import { isBackendConfigured } from '../lib/api/http';
import { AttendanceDB } from './AttendanceDB';

interface SystemStatus {
  cpu_percent: number | null;
  memory: any;
  model_ready: boolean;
  confidence_threshold: number;
}

export function System() {
  const backend = isBackendConfigured();
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [retraining, setRetraining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview'|'attendance-db'>('overview');

  const load = async () => {
    if (!backend) return;
    setLoading(true);
    try {
      const res = await fetch('/system/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (e:any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    if (!backend) return; const id = setInterval(load, 15000); return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend]);

  const retrain = async () => {
    setError(null); setSuccess(null);
    setRetraining(true);
    try {
      const res = await fetch('/system/retrain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force: true }) });
      if (res.ok) {
        setSuccess('Retrain queued');
      } else {
        setError('Failed to queue retrain');
      }
    } catch (e:any) {
      setError(e.message);
    } finally {
      setRetraining(false);
      setTimeout(() => setSuccess(null), 2500);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">System</h1>
        <p className="text-gray-600 dark:text-gray-400 text-sm">Runtime metrics, model management, diagnostics, and data stores.</p>
        <div className="mt-4 flex items-center gap-2 text-sm">
          <button onClick={() => setTab('overview')} className={`px-3 py-1 rounded ${tab==='overview' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200'}`}>Overview</button>
          <button onClick={() => setTab('attendance-db')} className={`px-3 py-1 rounded ${tab==='attendance-db' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200'}`}>Attendance DB</button>
          {/* Intruder feature fully removed */}
        </div>
      </div>
      {!backend && tab==='overview' && (
        <div className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-4 rounded-md border border-amber-200 dark:border-amber-800">Backend not configured. System metrics unavailable.</div>
      )}
      {tab==='overview' && backend && (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Runtime</h2>
              <button onClick={load} disabled={loading} className="text-xs px-3 py-1 rounded-md bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50">{loading ? 'Loading...' : 'Refresh'}</button>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-300 space-y-2">
              <p>CPU: {status?.cpu_percent != null ? `${status.cpu_percent}%` : '—'}</p>
              <p>Model Ready: <span className={`font-medium ${status?.model_ready ? 'text-green-600' : 'text-red-600'}`}>{status?.model_ready ? 'Yes' : 'No'}</span></p>
              <p>Confidence Threshold: {status?.confidence_threshold ?? '—'}</p>
              {status?.memory && (
                <div className="text-[11px] bg-gray-100 dark:bg-slate-700 rounded p-2 overflow-auto max-h-40">
                  <pre className="whitespace-pre-wrap break-all">{JSON.stringify(status.memory, null, 2)}</pre>
                </div>
              )}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Model Management</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">Rebuild face encodings after significant enrollment changes.</p>
            <button onClick={retrain} disabled={retraining} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50">{retraining ? 'Queuing...' : 'Re-train Face Encodings'}</button>
            {success && <div className="text-xs text-green-600 dark:text-green-400">{success}</div>}
            {error && <div className="text-xs text-red-600 dark:text-red-400">{error}</div>}
          </div>
          <div className="md:col-span-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Logs</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">For detailed logs use the Logs page.</p>
            <LogsPreview />
          </div>
        </div>
      )}
      {tab==='attendance-db' && (
        <AttendanceDB />
      )}
  {/* Intruder feature fully removed */}
    </div>
  );
}

function LogsPreview() {
  const [logs, setLogs] = useState<any[]>([]);
  const backend = isBackendConfigured();
  useEffect(() => {
    if (!backend) return;
    let active = true;
    const load = async () => {
      try {
        const res = await fetch('/logs');
        if (res.ok) {
          const data = await res.json();
          if (active) setLogs(data.logs || []);
        }
      } catch {/* ignore */}
    };
    load();
    const id = setInterval(load, 10000);
    return () => { active = false; clearInterval(id); };
  }, [backend]);

  return (
    <div className="text-[11px] bg-gray-100 dark:bg-slate-900/40 rounded p-2 max-h-60 overflow-auto space-y-1 font-mono">
      {logs.slice(-100).reverse().map((l,i) => (
        <div key={i} className="flex gap-2">
          <span className="text-gray-500">{l.ts?.split('T')[1]?.slice(0,8)}</span>
          <span className="text-blue-600 dark:text-blue-400 font-semibold">{l.event_type}</span>
          <span className="flex-1 truncate">{l.description}</span>
        </div>
      ))}
      {!logs.length && <div className="text-gray-500">No logs.</div>}
    </div>
  );
}
