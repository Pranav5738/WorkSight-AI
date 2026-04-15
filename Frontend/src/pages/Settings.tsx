import { useEffect, useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { fetchEmailSettings, updateEmailSettings, updateSettings, sendTestAlert, fetchEmailStatus, fetchAppPreferences, updateAppPreferences } from '../lib/api/settings';
import { getMonitoringStatus, startMonitoring, stopMonitoring, type MonitoringStatus } from '../lib/api/monitoring';
import { isBackendConfigured } from '../lib/api/http';
import { Toast } from '../components/Toast';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

export function Settings() {
  const { theme, toggleTheme } = useTheme();
  const backend = isBackendConfigured();
  const [email, setEmail] = useState('');
  const [savedEmail, setSavedEmail] = useState('');
  // enabled state provided by backend; we derive UI from savedEmail emptiness so no separate flag needed
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState<number | null>(null);
  const [bypassLevels, setBypassLevels] = useState<string[]>([]);
  const allLevels = ['low','medium','high','critical'];
  const [statusRefreshing, setStatusRefreshing] = useState(false);
  const [secondsUntilNext, setSecondsUntilNext] = useState<number | null>(null);
  const [nextAllowedAt, setNextAllowedAt] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number>(90); // percent UI
  const [notifyEmail, setNotifyEmail] = useState<boolean>(false);
  // Monitoring
  const [monStatus, setMonStatus] = useState<MonitoringStatus | null>(null);
  const [monLoading, setMonLoading] = useState(false);
  // Camera assignments
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [enumeratingCams, setEnumeratingCams] = useState(false);
  const [recogCamera, setRecogCamera] = useState<string | null>(null);
  // intruder camera removed

  // Poll status every 20s when backend enabled
  useEffect(() => {
    if (!backend) return;
    let active = true;
    const load = async () => {
      const st = await fetchEmailStatus();
      if (active && st) {
        setSecondsUntilNext(st.seconds_until_next);
        setNextAllowedAt(st.next_allowed_at);
      }
      // monitoring status
      const ms = await getMonitoringStatus().catch(() => null);
      if (active) setMonStatus(ms);
    };
    load();
    const id = setInterval(load, 20000);
    return () => { active = false; clearInterval(id); };
  }, [backend]);

  useEffect(() => {
    if (!backend) return; // only fetch when backend mode
    let mounted = true;
    (async () => {
      setLoadingEmail(true);
      const data = await fetchEmailSettings();
      if (mounted && data) {
        setEmail(data.alert_email);
        setSavedEmail(data.alert_email);
  setUpdatedAt(data.updated_at || null);
  setCooldown(data.alert_cooldown_seconds);
  setBypassLevels(data.alert_bypass_levels || []);
  // data.enabled available if needed in future
      } else if (mounted) {
        setUpdatedAt(null);
  // no enabled state tracked
      }
      setLoadingEmail(false);
      // Load app preferences after email settings
      const prefs = await fetchAppPreferences();
      if (mounted && prefs) {
        setConfidence(Math.round((prefs.confidence_threshold || 0.9) * 100));
        // remove intruder toggles; keep recognition camera only
        if (prefs.camera_assignments) {
          setRecogCamera(prefs.camera_assignments.recognition || null);
        }
      }
    })();
    return () => { mounted = false; };
  }, [backend]);

  // Enumerate camera devices (attempt to get labels by requesting permission first)
  useEffect(() => {
    let active = true;
    const enumerate = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      setEnumeratingCams(true);
      try {
        // Try to get permission so labels are populated (ignore failure)
        try {
          await navigator.mediaDevices.getUserMedia({ video: true });
        } catch { /* ignore */ }
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!active) return;
        const vids = devices.filter(d => d.kind === 'videoinput');
        setCameraDevices(vids);
        // If saved camera no longer present, clear it
        setRecogCamera(prev => prev && !vids.find(v => v.deviceId === prev) ? null : prev);
  // intruder camera removed
      } finally {
        if (active) setEnumeratingCams(false);
      }
    };
    enumerate();
    // Re-enumerate when page regains focus
    const onFocus = () => enumerate();
    window.addEventListener('focus', onFocus);
    return () => { active = false; window.removeEventListener('focus', onFocus); };
  }, []);

  const handleSave = async () => {
    setError(null); setSuccess(null);
    const trimmed = email.trim();
    // Allow clearing to disable alerts (empty string)
    if (trimmed) {
      const emailRegex = /^(?:[a-zA-Z0-9_'^&\-]+(?:\.[a-zA-Z0-9_'^&\-]+)*|".+")@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
      if (!emailRegex.test(trimmed)) { setError('Invalid email format'); return; }
    }
    setSaving(true);
    const res = await updateEmailSettings(trimmed);
    setSaving(false);
    if (!res) { setError('Failed to save email'); return; }
    setSavedEmail(res.alert_email);
    setUpdatedAt(res.updated_at || new Date().toISOString());
    setCooldown(res.alert_cooldown_seconds);
    setBypassLevels(res.alert_bypass_levels || []);
  // res.enabled available if needed
    setSuccess('Alert email updated');
    setTimeout(() => setSuccess(null), 2500);
  };

  const toggleBypass = (lvl: string) => {
    setBypassLevels(prev => prev.includes(lvl) ? prev.filter(l => l !== lvl) : [...prev, lvl]);
  };

  const saveAdvanced = async () => {
    setError(null); setSuccess(null);
    if (cooldown !== null && (cooldown < 0 || cooldown > 3600)) {
        setError('Cooldown must be between 0 and 3600 seconds');
        return;
    }
    const res = await updateSettings({
      alert_cooldown_seconds: cooldown ?? undefined,
      alert_bypass_levels: bypassLevels
    });
    if (!res) { setError('Failed to update advanced settings'); return; }
    setUpdatedAt(res.updated_at || new Date().toISOString());
    setCooldown(res.alert_cooldown_seconds);
    setBypassLevels(res.alert_bypass_levels || []);
    setSuccess('Alert settings updated');
    setTimeout(() => setSuccess(null), 2500);
  };

  const handleTest = async () => {
    setError(null); setSuccess(null);
    const ok = await sendTestAlert();
    if (ok) {
      setSuccess('Test alert queued');
      setTimeout(() => setSuccess(null), 2500);
    } else {
      setError('Failed to send test alert');
    }
  };

  const handleReset = async () => {
    setError(null); setSuccess(null);
    const res = await updateSettings({
      alert_cooldown_seconds: 60,
      alert_bypass_levels: ['high','critical']
    });
    if (!res) { setError('Failed to reset settings'); return; }
    setCooldown(res.alert_cooldown_seconds);
    setBypassLevels(res.alert_bypass_levels || []);
    setUpdatedAt(res.updated_at || new Date().toISOString());
    setSuccess('Alert rules reset');
    setTimeout(() => setSuccess(null), 2500);
  };

  const refreshStatus = async () => {
    if (!backend) return;
    setStatusRefreshing(true);
    const st = await fetchEmailStatus();
    if (st) {
      setSecondsUntilNext(st.seconds_until_next);
      setNextAllowedAt(st.next_allowed_at);
    }
    setStatusRefreshing(false);
  };

  const formatRelative = (iso: string | null) => {
    if (!iso) return null;
    try {
      const dt = new Date(iso);
      const diffMs = Date.now() - dt.getTime();
      const sec = Math.floor(diffMs / 1000);
      if (sec < 60) return 'just now';
      const min = Math.floor(sec / 60);
      if (min < 60) return `${min}m ago`;
      const hr = Math.floor(min / 60);
      if (hr < 24) return `${hr}h ago`;
      const d = Math.floor(hr / 24);
      return `${d}d ago`;
    } catch { return null; }
  };

  return (
    <div className="space-y-8">
      <PageHeader title="Settings" description="Customize recognition, notifications, camera routing, and monitoring behavior." />

      <div className="grid grid-cols-1 gap-6 max-w-3xl">
        <Card>
          <CardTitle title="Appearance" subtitle="Visual mode and theme preferences." />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-800 dark:text-gray-200">Theme</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Switch between Light and Night modes</p>
            </div>
            <button
              onClick={toggleTheme}
              className="relative inline-flex h-8 w-16 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 border border-gray-300 dark:border-slate-600"
              aria-label="Toggle theme"
            >
              <span className={`ml-1 inline-block h-6 w-6 transform rounded-full bg-gradient-to-br from-blue-600 to-purple-600 shadow transition-transform ${theme === 'dark' ? 'translate-x-8' : ''}`}></span>
            </button>
          </div>
          <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            Active Theme: <span className="font-semibold text-gray-900 dark:text-white capitalize">{theme}</span>
          </div>
        </Card>
        {backend && (
          <Card>
            <CardTitle title="Employee Work Activity Monitoring" subtitle="Runtime controls for monitor service and alert sampling." />
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Detects idle/away states from the camera and alerts a manager when thresholds are exceeded.</p>
            <div className="flex items-center gap-3 mb-3">
              <Button
                disabled={monLoading || monStatus?.running}
                onClick={async () => { setMonLoading(true); await startMonitoring().catch(()=>{}); const s=await getMonitoringStatus().catch(()=>null); setMonStatus(s); setMonLoading(false); }}
              >Start</Button>
              <Button
                variant="destructive"
                disabled={monLoading || !monStatus?.running}
                onClick={async () => { setMonLoading(true); await stopMonitoring().catch(()=>{}); const s=await getMonitoringStatus().catch(()=>null); setMonStatus(s); setMonLoading(false); }}
              >Stop</Button>
              <Button
                variant="secondary"
                onClick={async () => { setMonLoading(true); const s=await getMonitoringStatus().catch(()=>null); setMonStatus(s); setMonLoading(false); }}
              >Refresh</Button>
              <span className="text-xs text-gray-600 dark:text-gray-400">{monStatus?.enabled ? (monStatus.running ? 'Running' : 'Stopped') : 'Disabled by server'}</span>
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">
              <p>Recent alerts:</p>
              <ul className="mt-2 space-y-1 max-h-40 overflow-auto">
                {monStatus?.alerts?.length ? monStatus.alerts.map((a, i) => (
                  <li key={i} className="p-2 rounded border border-gray-200 dark:border-slate-700">
                    <span className="font-medium">{a.state.toUpperCase()}</span> for {Math.round(a.duration_sec)}s — {a.message || 'No message'}
                  </li>
                )) : <li className="italic">None</li>}
              </ul>
            </div>
          </Card>
        )}
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Recognition Preferences</h2>
          <div className="space-y-6">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Confidence Threshold ({confidence}%)</label>
              <input
                type="range"
                min={50}
                max={100}
                value={confidence}
                onChange={e => setConfidence(Number(e.target.value))}
                className="w-full"
              />
              <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">AI must reach this confidence or higher to count a match.</p>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={notifyEmail} onChange={e => setNotifyEmail(e.target.checked)} className="rounded" /> Email Alerts
              </label>
              {/* SMS alerts removed */}
            </div>
            <div>
              <Button
                onClick={async () => {
                  const camera_assignments: Record<string,string> = {};
                  if (recogCamera) camera_assignments.recognition = recogCamera;
                  const res = await updateAppPreferences({
                    confidence_threshold: confidence / 100,
                    // intruder notifications removed
                    camera_assignments
                  });
                  if (res) {
                    setSuccess('Preferences saved');
                    setTimeout(() => setSuccess(null), 2000);
                  } else {
                    setError('Failed to save preferences');
                  }
                }}
                variant="primary"
              >
                Save Preferences
              </Button>
            </div>
            <div className="pt-2 border-t border-dashed border-gray-200 dark:border-slate-700" />
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">Camera Assignments</h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">Choose which physical cameras are used for recognition. Leave unassigned to let the system pick the first available.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Recognition Camera</label>
                  <select
                    value={recogCamera || ''}
                    onChange={e => setRecogCamera(e.target.value || null)}
                    className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">Auto (First Available)</option>
                    {cameraDevices.map(d => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0,6)}`}</option>
                    ))}
                  </select>
                </div>
                {/* Intruder Monitor Camera removed */}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    // force re-enumeration
                    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
                      setEnumeratingCams(true);
                      navigator.mediaDevices.getUserMedia({ video: true }).catch(()=>{/* ignore */}).finally(async () => {
                        try {
                          const devs = await navigator.mediaDevices.enumerateDevices();
                          const vids = devs.filter(d => d.kind === 'videoinput');
                          setCameraDevices(vids);
                        } finally {
                          setEnumeratingCams(false);
                        }
                      });
                    }
                  }}
                  disabled={enumeratingCams}
                >
                  {enumeratingCams ? 'Scanning…' : 'Re-scan Cameras'}
                </Button>
                <span className="text-[11px] text-gray-500 dark:text-gray-400">
                  {cameraDevices.length ? `${cameraDevices.length} camera${cameraDevices.length>1?'s':''} detected` : 'No cameras detected'}
                </span>
              </div>
            </div>
          </div>
        </div>
        {backend && (
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Alert & Notification Email</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loadingEmail || saving}
                  placeholder="alerts@example.com"
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-2">
                  {savedEmail ? (
                    <>
                      <span>Current saved email:</span>
                      <span className="font-medium">{savedEmail}</span>
                    </>
                  ) : (
                    <span className="italic text-gray-400 dark:text-gray-500">Email alerts disabled</span>
                  )}
                  {updatedAt && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700 border border-gray-200 dark:border-slate-600">{formatRelative(updatedAt)}</span>
                  )}
                </p>
              </div>
              {error && <div className="text-xs text-red-600 dark:text-red-400">{error}</div>}
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleSave}
                  disabled={saving || loadingEmail || email.trim() === savedEmail}
                  variant="primary"
                  className={email.trim() === savedEmail ? 'opacity-60' : ''}
                >
                  {saving ? 'Saving...' : 'Save'}
                </Button>
                {loadingEmail && <span className="text-xs text-gray-500 dark:text-gray-400">Loading…</span>}
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                This email receives system notifications. Clear the field to disable email alerts.
              </p>
              <div className="pt-4 border-t border-dashed border-gray-200 dark:border-slate-700" />
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Advanced Alert Controls</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Email Cooldown (seconds)</label>
                    <input
                      type="number"
                      min={0}
                      max={3600}
                      value={cooldown ?? ''}
                      onChange={e => setCooldown(e.target.value === '' ? null : Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="60"
                    />
                    <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">0 = no throttling</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Bypass Levels</label>
                    <div className="flex flex-wrap gap-2">
                      {allLevels.map(lvl => {
                        const active = bypassLevels.includes(lvl);
                        return (
                          <Button
                            key={lvl}
                            onClick={() => toggleBypass(lvl)}
                            variant={active ? 'chip-active' : 'chip'}
                            size="sm"
                            className="rounded-full text-[11px]"
                          >
                            {lvl}
                          </Button>
                        );
                      })}
                    </div>
                    <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">Selected levels always send immediately.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    onClick={saveAdvanced}
                    disabled={saving}
                  >
                    Save Alert Rules
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={handleTest}
                  >
                    Send Test Email
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={handleReset}
                  >
                    Reset Defaults
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={refreshStatus}
                    disabled={statusRefreshing}
                  >
                    {statusRefreshing ? 'Refreshing...' : 'Refresh Status'}
                  </Button>
                </div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-4 pt-2">
                  <span>Cooldown: <strong>{cooldown ?? '—'}s</strong></span>
                  <span>Bypass: {bypassLevels.length ? bypassLevels.join(', ') : 'none'}</span>
                  <span>Next allowed: {nextAllowedAt ? formatRelative(nextAllowedAt) || 'soon' : 'now'}</span>
                  {secondsUntilNext !== null && secondsUntilNext > 0 && (
                    <span>{secondsUntilNext}s remaining</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      {success && <Toast message={success} type="success" onClose={() => setSuccess(null)} duration={2500} />}
      {error && !success && <Toast message={error} type="error" onClose={() => setError(null)} duration={3500} />}
    </div>
  );
}
