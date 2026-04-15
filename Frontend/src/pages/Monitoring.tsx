import { useEffect, useState } from 'react';
import { getMonitoringStatus, startMonitoring, stopMonitoring, startMonitoringDemo, type MonitoringStatus } from '../lib/api/monitoring';
import { CameraView } from '../components/CameraView';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState, LoadingState } from '../components/ui/DataStates';

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
    <div className="space-y-6">
      <PageHeader
        title="Monitoring"
        description="Real-time activity monitoring, live service controls, and alert stream for operations."
        actions={<Button variant="secondary" onClick={async () => { setLoading(true); const s = await getMonitoringStatus().catch(() => null); setStatus(s); setLoading(false); }}>Refresh</Button>}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardTitle title="Camera Preview" subtitle="Client-side module for calibration and quick frame checks before service start." />
          <CameraView className="aspect-video" autoStart={false} />
        </Card>

        <Card className="xl:col-span-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Service Controls</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Start, stop, demo-run, and inspect runtime state.</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 mr-2">
                <input type="checkbox" checked={autoDemo} onChange={e => { setAutoDemo(e.target.checked); try { window.localStorage.setItem('monitoring:autoDemo', e.target.checked ? '1' : '0'); } catch {} }} />
                Auto-start demo
              </label>
              <Button
                disabled={loading || status?.running !== false || status?.enabled === false}
                onClick={async () => { setLoading(true); await startMonitoring().catch(()=>{}); const s=await getMonitoringStatus().catch(()=>null); setStatus(s); setLoading(false); }}
              >Start</Button>
              <Button
                variant="destructive"
                disabled={loading || !status?.running || status?.enabled === false}
                onClick={async () => { setLoading(true); await stopMonitoring().catch(()=>{}); const s=await getMonitoringStatus().catch(()=>null); setStatus(s); setLoading(false); }}
              >Stop</Button>
              <Button
                variant="secondary"
                title="Loop images from uploads/*.jpg for demo"
                onClick={async () => { setLoading(true); await startMonitoringDemo({ pattern: 'Backend/uploads/*.jpg', fps: 6, idle_sec: 5, away_sec: 5 }).catch(()=>{}); const s=await getMonitoringStatus().catch(()=>null); setStatus(s); setLoading(false); }}
              >Start Demo</Button>
              <Button
                variant="ghost"
                onClick={async () => { setLoading(true); const s=await getMonitoringStatus().catch(()=>null); setStatus(s); setLoading(false); }}
              >Refresh</Button>
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
        </Card>

        <Card className="xl:col-span-12">
          <CardTitle title="Recent Alerts" subtitle="Most recent 50 activity alerts generated by the monitoring engine." />
          {loading && !status ? (
            <LoadingState label="Loading monitoring alerts..." />
          ) : !status?.alerts?.length ? (
            <EmptyState title="No alerts yet" subtitle="Alerts will appear once the monitoring service detects events." />
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {status.alerts.map((a, idx) => (
                <div key={idx} className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-100">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{a.state.toUpperCase()}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{a.employee_id || `Track #${a.track_id ?? '?'}`}</div>
                  </div>
                  <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">Duration: {Math.round(a.duration_sec)}s</div>
                  {a.message && <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">{a.message}</div>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
