import { useEffect, useState } from 'react';
import { getMonitoringStatus, startMonitoring, stopMonitoring, startMonitoringDemo, type MonitoringStatus } from '../lib/api/monitoring';
import { CameraView } from '../components/CameraView';

export default function MonitoringPage() {
  const [status, setStatus] = useState<MonitoringStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoDemo, setAutoDemo] = useState<boolean>(() => {
    try { return window.localStorage.getItem('monitoring:autoDemo') === '1'; } catch { return false; }
  });

  useEffect(() => {
    let active = true;
    const load = async () => {
      const s = await getMonitoringStatus().catch(() => null);
      if (active) setStatus(s);
    };
    load();
    const id = setInterval(load, 15000);
    return () => { active = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    (async () => {
      if (autoDemo) {
        setLoading(true);
        await startMonitoringDemo({ pattern: 'Backend/uploads/*.jpg', fps: 6, idle_sec: 5, away_sec: 5 }).catch(() => {});
        const s = await getMonitoringStatus().catch(() => null);
        setStatus(s);
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDemo]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Monitoring</h1>
        <p className="text-gray-600 dark:text-gray-400 text-sm">Real-time employee work activity monitoring and alerts.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 max-w-5xl">
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Camera Preview (Client-side)</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">This preview runs in your browser for demo purposes and does not stream to the server. Use Start to run backend monitoring or Start Demo to loop local images.</p>
          <CameraView className="aspect-video" autoStart={false} />
        </div>
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Service</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Start or stop the background monitoring loop</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 mr-2">
                <input type="checkbox" checked={autoDemo} onChange={e => { setAutoDemo(e.target.checked); try { window.localStorage.setItem('monitoring:autoDemo', e.target.checked ? '1' : '0'); } catch {} }} />
                Auto-start demo
              </label>
              <button
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                disabled={loading || status?.running !== false || status?.enabled === false}
                onClick={async () => { setLoading(true); await startMonitoring().catch(()=>{}); const s=await getMonitoringStatus().catch(()=>null); setStatus(s); setLoading(false); }}
              >Start</button>
              <button
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50"
                disabled={loading || !status?.running || status?.enabled === false}
                onClick={async () => { setLoading(true); await stopMonitoring().catch(()=>{}); const s=await getMonitoringStatus().catch(()=>null); setStatus(s); setLoading(false); }}
              >Stop</button>
              <button
                className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-amber-600 hover:bg-amber-700"
                title="Loop images from uploads/*.jpg for demo"
                onClick={async () => { setLoading(true); await startMonitoringDemo({ pattern: 'Backend/uploads/*.jpg', fps: 6, idle_sec: 5, away_sec: 5 }).catch(()=>{}); const s=await getMonitoringStatus().catch(()=>null); setStatus(s); setLoading(false); }}
              >Start Demo</button>
              <button
                className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                onClick={async () => { setLoading(true); const s=await getMonitoringStatus().catch(()=>null); setStatus(s); setLoading(false); }}
              >Refresh</button>
            </div>
          </div>
          <div className="mt-4 text-sm">
            <span className="text-gray-600 dark:text-gray-300">Status: </span>
            {status?.enabled === false ? (
              <span className="px-2 py-1 rounded bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300">Disabled</span>
            ) : status?.running ? (
              <span className="px-2 py-1 rounded bg-emerald-600 text-white">Running</span>
            ) : (
              <span className="px-2 py-1 rounded bg-yellow-500 text-white">Stopped</span>
            )}
            {status?.config?.video_source && (
              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">Source: {String((status as any).config.video_source)} {status?.config?.demo_fps ? `@ ${status.config.demo_fps} fps` : ''}</div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Alerts</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Latest 50 alerts are shown here</p>
          <div className="space-y-2 max-h-80 overflow-auto">
            {status?.alerts?.length ? status.alerts.map((a, idx) => (
              <div key={idx} className="p-3 rounded border border-gray-200 dark:border-slate-700 text-sm text-gray-800 dark:text-gray-100">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{a.state.toUpperCase()}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{a.employee_id || `Track #${a.track_id ?? '?'}`}</div>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-300">Duration: {Math.round(a.duration_sec)}s</div>
                {a.message && <div className="text-xs text-gray-600 dark:text-gray-300">{a.message}</div>}
              </div>
            )) : (
              <div className="text-sm italic text-gray-500 dark:text-gray-400">No alerts yet</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
