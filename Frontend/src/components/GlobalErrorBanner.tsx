import { useEffect, useState } from 'react';
import { onBackendError } from '../lib/api/http';
import { AlertTriangle, X } from 'lucide-react';

export function GlobalErrorBanner() {
  const [message, setMessage] = useState<string | null>(null);
  const [ts, setTs] = useState<number>(0);

  useEffect(() => {
    const off = onBackendError(err => {
      setMessage(err.message.replace(/^(HTTP \d+)$/, 'Backend error: $1'));
      setTs(Date.now());
    });
    return () => { off(); };
  }, []);

  if (!message) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-50 flex justify-center p-3 pointer-events-none">
      <div className="pointer-events-auto max-w-3xl w-full mx-4 bg-red-600 text-white rounded-lg shadow-lg flex items-start gap-3 p-3 animate-in slide-in-from-top">
        <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
        <div className="flex-1 text-sm">
          <p className="font-semibold">Backend Issue Detected</p>
          <p className="opacity-90 break-words">{message}</p>
          <p className="text-xs opacity-70 mt-1">{new Date(ts).toLocaleTimeString()}</p>
        </div>
        <button onClick={() => setMessage(null)} className="opacity-80 hover:opacity-100">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
