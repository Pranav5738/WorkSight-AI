import { useEffect, useState } from 'react';
import { getMonitoringSummary, getMonitoringDeductions, type ProductivityTotals, downloadMonitoringSummaryCsv, getMonitoringPolicy, setMonitoringPolicy } from '../lib/api/monitoring';

export default function ManagerPage() {
  const [date, setDate] = useState<string>('');
  const [summary, setSummary] = useState<{ date: string; totals: ProductivityTotals } | null>(null);
  const [policy, setPolicy] = useState({ idle_minutes: 30, idle_deduction: 50, away_minutes: 15, away_deduction: 25 });
  const [deductions, setDeductions] = useState<{ totals: ProductivityTotals } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      // Load persisted policy if any
      try {
        const p = await getMonitoringPolicy();
        if (p?.policy && Object.keys(p.policy).length) {
          setPolicy(prev => ({ ...prev, ...p.policy }));
        }
      } catch {}
      const s = await getMonitoringSummary(date || undefined);
      setSummary(s);
      const d = await getMonitoringDeductions(policy);
      setDeductions(d);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = deductions?.totals || summary?.totals || {};

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Manager Dashboard</h1>
        <p className="text-gray-600 dark:text-gray-400 text-sm">Daily productivity, policy, and estimated deductions</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl">
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
          <h2 className="text-md font-semibold text-gray-900 dark:text-white mb-3">Filters</h2>
          <div className="space-y-3 text-sm">
            <label className="block">
              <span className="text-gray-600 dark:text-gray-300">Date (YYYY-MM-DD)</span>
              <input value={date} onChange={e => setDate(e.target.value)} placeholder="" className="mt-1 w-full bg-white/70 dark:bg-slate-900 rounded border border-gray-300 dark:border-slate-700 px-2 py-1" />
            </label>
            <button onClick={load} disabled={loading} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm">Refresh</button>
          </div>
          <h2 className="text-md font-semibold text-gray-900 dark:text-white mt-6 mb-2">Policy</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <label className="block">
              <span className="text-gray-600 dark:text-gray-300">Idle minutes</span>
              <input type="number" value={policy.idle_minutes} onChange={e => setPolicy(p => ({ ...p, idle_minutes: Number(e.target.value) }))} className="mt-1 w-full bg-white/70 dark:bg-slate-900 rounded border border-gray-300 dark:border-slate-700 px-2 py-1" />
            </label>
            <label className="block">
              <span className="text-gray-600 dark:text-gray-300">Idle deduction</span>
              <input type="number" value={policy.idle_deduction} onChange={e => setPolicy(p => ({ ...p, idle_deduction: Number(e.target.value) }))} className="mt-1 w-full bg-white/70 dark:bg-slate-900 rounded border border-gray-300 dark:border-slate-700 px-2 py-1" />
            </label>
            <label className="block">
              <span className="text-gray-600 dark:text-gray-300">Away minutes</span>
              <input type="number" value={policy.away_minutes} onChange={e => setPolicy(p => ({ ...p, away_minutes: Number(e.target.value) }))} className="mt-1 w-full bg-white/70 dark:bg-slate-900 rounded border border-gray-300 dark:border-slate-700 px-2 py-1" />
            </label>
            <label className="block">
              <span className="text-gray-600 dark:text-gray-300">Away deduction</span>
              <input type="number" value={policy.away_deduction} onChange={e => setPolicy(p => ({ ...p, away_deduction: Number(e.target.value) }))} className="mt-1 w-full bg-white/70 dark:bg-slate-900 rounded border border-gray-300 dark:border-slate-700 px-2 py-1" />
            </label>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button onClick={async () => { setLoading(true); try { await setMonitoringPolicy(policy); const d = await getMonitoringDeductions(policy); setDeductions(d); } finally { setLoading(false); } }} disabled={loading} className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-sm">Apply Policy</button>
            <button onClick={async () => { const blob = await downloadMonitoringSummaryCsv(date || undefined); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `summary_${date || 'today'}.csv`; a.click(); URL.revokeObjectURL(url); }} className="px-3 py-1.5 rounded bg-slate-600 hover:bg-slate-700 text-white text-sm">Download CSV</button>
          </div>
        </div>
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
          <h2 className="text-md font-semibold text-gray-900 dark:text-white mb-3">Daily Totals</h2>
          {Object.keys(totals).length === 0 ? (
            <div className="text-sm italic text-gray-500 dark:text-gray-400">No data</div>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-auto">
              {Object.entries(totals).map(([emp, s]) => {
                const name = (!emp || emp === 'null') ? 'Unknown' : emp;
                return (
                <div key={name} className="p-3 rounded border border-gray-200 dark:border-slate-700 text-sm text-gray-800 dark:text-gray-100">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{name}</div>
                    {typeof s.deduction === 'number' && <div className="text-xs px-2 py-0.5 rounded bg-rose-600 text-white">Deduction: {s.deduction.toFixed(2)}</div>}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-xs text-gray-600 dark:text-gray-300">
                    <div>Working: {Math.round(s.working_sec)}s</div>
                    <div>Idle: {Math.round(s.idle_sec)}s</div>
                    <div>Away: {Math.round(s.away_sec)}s</div>
                    <div>Sleeping: {Math.round(s.sleeping_sec)}s</div>
                  </div>
                </div>
              )})}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
