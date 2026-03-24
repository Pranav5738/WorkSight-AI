import { useEffect, useRef, useState, useCallback } from 'react';
import { useCameraAccess } from '../contexts/CameraAccessContext';
import { Camera, RefreshCcw, AlertTriangle, Bug } from 'lucide-react';

interface CameraViewProps {
  onFrame?: (imageData: string) => void;
  captureInterval?: number;
  className?: string;
  forceSimulated?: boolean;
  autoStart?: boolean; // if false, require user click to enable camera (privacy)
  targetDeviceId?: string; // externally preferred device id (from assignments)
}

export function CameraView({ onFrame, captureInterval, className = '', forceSimulated, autoStart = true, targetDeviceId }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSimulated, setIsSimulated] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [initializing, setInitializing] = useState(false);
  const [lastFrameTs, setLastFrameTs] = useState<number | null>(null);
  const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied' | 'unknown'>('unknown');
  const [attempt, setAttempt] = useState(0);
  const [debug, setDebug] = useState<string[]>([]);
  const timeoutRef = useRef<number | null>(null);
  const fallbackReadyRef = useRef<number | null>(null);
  const { enabled: globalEnabled } = useCameraAccess();
  const [started, setStarted] = useState<boolean>(autoStart && globalEnabled); // track explicit user consent
  const hasPermissionRef = useRef<boolean | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const desiredDeviceRef = useRef<string | null>(null);

  const pushDebug = (msg: string) => setDebug((d: string[]) => [...d.slice(-40), `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const stopStream = () => {
    if (streamRef.current) {
  streamRef.current.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      streamRef.current = null;
    }
  };

  const enumerate = useCallback(async () => {
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
  const cams = all.filter((d: MediaDeviceInfo) => d.kind === 'videoinput');
        setDevices(cams);
        pushDebug(`Devices: ${cams.length}`);
        // Apply preferred camera (targetDeviceId takes precedence, then persisted desiredDeviceRef)
        const preferredId = targetDeviceId || desiredDeviceRef.current;
        if (preferredId && cams.find(c => c.deviceId === preferredId)) {
          setDeviceId(prev => prev !== preferredId ? preferredId : prev);
        } else if (!deviceId && cams.length > 0) {
          setDeviceId(cams[0].deviceId);
        }
      } catch (e: any) {
        pushDebug(`enumerateDevices error: ${e?.message || e}`);
      }
    }, [deviceId, targetDeviceId]);

  // Load persisted deviceId preference on mount
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('cameraDeviceId');
      if (saved) desiredDeviceRef.current = saved;
    } catch {}
  }, []);

  const init = useCallback(async () => {
      if (forceSimulated) {
        setIsSimulated(true); setHasPermission(false); pushDebug('Forced simulation'); return;
      }
      if (initializing) return;
      setInitializing(true);
  setAttempt((a: number) => a + 1);
      pushDebug('Init start');
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => {
        if (!streamRef.current && hasPermissionRef.current === null) {
          pushDebug('Init timeout -> simulation');
          setIsSimulated(true); setHasPermission(false); setError('Timeout acquiring camera.');
        } else {
          pushDebug('Init timeout ignored (stream acquired)');
        }
      }, 15000);
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('mediaDevices unsupported');
        try {
          const status = await navigator.permissions?.query?.({ name: 'camera' as any });
          if (status) {
            setPermissionState(status.state as any);
            pushDebug(`Permission: ${status.state}`);
            status.onchange = () => { setPermissionState(status.state as any); pushDebug(`Permission change: ${status.state}`); };
          }
        } catch (e: any) { pushDebug(`permissions.query fail: ${e?.message}`); }

  await enumerate();

        const variants: MediaStreamConstraints[] = [
          { video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' } },
          { video: { width: { ideal: 1280 }, height: { ideal: 720 } } },
          { video: { facingMode: 'environment' } },
          { video: true }
        ];
        let obtained: MediaStream | null = null; let lastErr: any = null;
        for (let i = 0; i < variants.length; i++) {
          try { pushDebug(`getUserMedia try ${i + 1}`); obtained = await navigator.mediaDevices.getUserMedia(variants[i]); pushDebug(`Success variant ${i + 1}`); break; }
          catch (e: any) { lastErr = e; pushDebug(`Variant ${i + 1} fail: ${e?.name}`); }
        }
        if (!obtained) throw lastErr || new Error('All variants failed');
        stopStream();
        streamRef.current = obtained;
        if (videoRef.current) {
          videoRef.current.srcObject = obtained;
          const p = videoRef.current.play();
          if (p?.catch) p.catch(e => pushDebug(`play() rejected: ${e?.message}`));
          const metaHandler = () => {
            pushDebug(`Metadata ${videoRef.current?.videoWidth}x${videoRef.current?.videoHeight}`);
            setHasPermission(true); hasPermissionRef.current = true; setPermissionState('granted'); setError(null);
            if (timeoutRef.current) { window.clearTimeout(timeoutRef.current); timeoutRef.current = null; }
            if (fallbackReadyRef.current) { window.clearTimeout(fallbackReadyRef.current); fallbackReadyRef.current = null; }
          };
          videoRef.current.onloadedmetadata = metaHandler;
          videoRef.current.onloadeddata = metaHandler;
          // Fallback: if metadata event never fires but stream is live
          fallbackReadyRef.current = window.setTimeout(() => {
            if (hasPermissionRef.current === null && streamRef.current) {
              pushDebug('Fallback: marking camera ready (no metadata event)');
              setHasPermission(true); hasPermissionRef.current = true; setPermissionState('granted'); setError(null);
            }
          }, 1200);
        } else {
          pushDebug('videoRef not mounted during init (adding invisible element fallback)');
        }
      } catch (e: any) {
        pushDebug(`Init failure: ${e?.name || e}`);
        setHasPermission(false); hasPermissionRef.current = false; setIsSimulated(true); setError(e?.name ? `${e.name}: ${e.message}` : 'Camera error; simulation.');
        if (e?.name === 'NotAllowedError') setPermissionState('denied');
      } finally { setInitializing(false); }
    }, [attempt, deviceId, enumerate, forceSimulated, initializing]);

  useEffect(() => { hasPermissionRef.current = hasPermission; }, [hasPermission]);

  // Listen for global disable event to force shutdown
  useEffect(() => {
    const handler = () => {
      stopStream();
      setStarted(false);
      setHasPermission(null);
      hasPermissionRef.current = null;
    };
    window.addEventListener('global-camera-disabled', handler);
    return () => window.removeEventListener('global-camera-disabled', handler);
  }, []);

  useEffect(() => {
    // Auto start only when both local and global toggles allow
    if (!started || !globalEnabled) return;
    let intervalId: number | null = null;
    init();
    if (captureInterval && onFrame) {
      intervalId = window.setInterval(() => { captureFrame(); }, captureInterval);
    }
    return () => {
      if (intervalId) window.clearInterval(intervalId);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      stopStream();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureInterval, onFrame, deviceId, forceSimulated, started, globalEnabled, targetDeviceId]);

  // React to changes in externally provided targetDeviceId after initial load
  useEffect(() => {
    if (!targetDeviceId) return;
    if (deviceId !== targetDeviceId && devices.find(d => d.deviceId === targetDeviceId)) {
      pushDebug(`Switching to target deviceId ${targetDeviceId}`);
      setDeviceId(targetDeviceId);
      // Re-init with new device
      retry();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetDeviceId]);

  const captureFrame = () => {
    if (!canvasRef.current || !videoRef.current) return;
    const video = videoRef.current;
    if (!video.videoWidth || !video.videoHeight) return;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg');
    onFrame?.(data);
    setLastFrameTs(Date.now());
  };

  const retry = () => {
    pushDebug('Manual re-init');
    setHasPermission(null); hasPermissionRef.current = null;
    setIsSimulated(false);
    setError(null);
    // Slight delay so state reset renders before new init
    setTimeout(() => init(), 50);
  };

  const Diagnostics = () => debug.length ? (
    <details className="mt-2 w-64 max-h-32 overflow-auto text-left bg-slate-800/60 rounded p-2 text-[10px]">
      <summary className="cursor-pointer flex items-center gap-1">Diagnostics <Bug className="w-3 h-3" /></summary>
  {debug.slice(-10).map((d: string, i: number) => <div key={i}>{d}</div>)}
    </details>
  ) : null;

  // Pre-consent / manual start placeholder (privacy-first)
  if (!started || !globalEnabled) {
    return (
      <div className={`relative flex flex-col items-center justify-center bg-slate-900/80 border border-slate-700 rounded-lg text-center p-6 ${className}`}>
        <Camera className="w-12 h-12 text-slate-400 mb-4" />
        <h3 className="text-sm font-semibold text-slate-200 mb-1">Camera Disabled</h3>
        <p className="text-[11px] text-slate-400 mb-4 max-w-xs">For privacy the camera is off. Enable globally in the header and then here to start the live feed.</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStarted(true)}
            className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium shadow"
          >Enable Camera</button>
          <button
            type="button"
            onClick={() => { setStarted(true); setIsSimulated(true); setHasPermission(false); }}
            aria-label="Demo camera"
            className="px-4 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs font-medium"
          >Simulate</button>
        </div>
        <p className="mt-3 text-[10px] text-slate-500">No permission requested until you enable.</p>
      </div>
    );
  }

  if (hasPermission === false || isSimulated) {
    return (
      <div className={`relative bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg overflow-hidden ${className}`}>
        {/* Hidden video element so ref is mounted for future retries */}
        <video ref={videoRef} className="hidden" playsInline muted />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white px-4">
          <Camera className="w-16 h-16 mb-4 opacity-50" />
          <p className="text-sm font-medium mb-1">Camera Simulation Mode</p>
            <p className="text-xs text-slate-400 text-center mb-2">{error || 'Simulated camera feed for demonstration'}</p>
            {devices.length === 0 && !forceSimulated && (<p className="text-[10px] text-amber-300">No video devices detected</p>)}
            <div className="mt-3 flex flex-col items-center gap-2 w-full">
              <div className="flex items-center gap-2">
                <button type="button" onClick={retry} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center gap-1">
                  <RefreshCcw className="w-3 h-3" /> Retry
                </button>
                {!forceSimulated && devices.length > 1 && (
                  <select
                    className="bg-slate-700 text-xs px-2 py-1 rounded border border-slate-500"
                    value={deviceId || ''}
                    onChange={e => { setDeviceId(e.target.value); try { window.localStorage.setItem('cameraDeviceId', e.target.value); desiredDeviceRef.current = e.target.value; } catch {} }}
                  >
                    {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>)}
                  </select>
                )}
              </div>
              {permissionState === 'denied' && <div className="text-[10px] text-center text-red-300 leading-snug">Permission denied. Allow camera & press Retry.</div>}
              {permissionState === 'prompt' && <div className="text-[10px] text-center text-amber-200 leading-snug">Waiting for permission prompt…</div>}
              {window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && <div className="text-[10px] text-center text-amber-300 leading-snug">Use HTTPS or localhost for real camera.</div>}
              <Diagnostics />
            </div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 animate-pulse" />
        <canvas ref={canvasRef} className="hidden" />
      </div>
    );
  }

  if (hasPermission === null) {
    return (
      <div className={`relative bg-slate-800 rounded-lg flex items-center justify-center ${className}`}>
        {/* Hidden video element so init can attach before permission state flips */}
        <video ref={videoRef} className="hidden" playsInline muted />
        <div className="text-center text-white px-4">
          <Camera className="w-12 h-12 mx-auto mb-3 animate-pulse" />
          <p className="text-sm">{initializing ? 'Requesting camera access…' : 'Initializing camera…'}</p>
          <p className="mt-1 text-[10px] text-slate-400">Attempt {attempt}</p>
          {devices.length > 1 && (
            <div className="mt-3">
              <select
                className="bg-slate-700 text-xs px-2 py-1 rounded border border-slate-500"
                value={deviceId || ''}
                onChange={e => { setDeviceId(e.target.value); try { window.localStorage.setItem('cameraDeviceId', e.target.value); desiredDeviceRef.current = e.target.value; } catch {} }}
              >
                {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>)}
              </select>
            </div>
          )}
          <div className="mt-3">
            <button type="button" onClick={retry} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center gap-1">
              <RefreshCcw className="w-3 h-3" /> Re-init
            </button>
          </div>
          <Diagnostics />
        </div>
      </div>
    );
  }

  return (
    <div className={`relative bg-black rounded-lg overflow-hidden ${className}`}>
      <video ref={videoRef} autoPlay playsInline muted onLoadedMetadata={captureFrame} className="w-full h-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />
      <div className="absolute top-3 left-3 flex items-center gap-2 bg-red-600 px-3 py-1 rounded-full">
        <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
        <span className="text-white text-xs font-medium">LIVE</span>
      </div>
      <div className="absolute bottom-2 left-2 flex items-center gap-2">
        <button type="button" onClick={captureFrame} className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-[10px] border border-white/20">Snap</button>
        {devices.length > 1 && (
          <select
            className="bg-white/10 text-white text-[10px] px-2 py-1 rounded border border-white/20"
            value={deviceId || ''}
            onChange={e => { setDeviceId(e.target.value); retry(); try { window.localStorage.setItem('cameraDeviceId', e.target.value); desiredDeviceRef.current = e.target.value; } catch {} }}
          >
            {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>)}
          </select>
        )}
        {lastFrameTs && Date.now() - lastFrameTs > 5000 && (
          <span className="flex items-center gap-1 text-[10px] bg-amber-600/80 px-2 py-1 rounded text-white">
            <AlertTriangle className="w-3 h-3" /> No recent frames
          </span>
        )}
      </div>
      <div className="absolute bottom-2 right-2">
        <Diagnostics />
      </div>
    </div>
  );
}
