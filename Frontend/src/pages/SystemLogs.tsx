import { useEffect, useState } from 'react';
import { Activity, Filter, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { SystemLog } from '../types/database';
import { isBackendConfigured } from '../lib/api/http';
import { fetchLogs } from '../lib/api/logs';

type LogFilter = 'all' | 'auth' | 'attendance' | 'security' | 'system';

export function SystemLogs() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [filter, setFilter] = useState<LogFilter>('all');
  const [loading, setLoading] = useState(true);
  const backendMode = isBackendConfigured();

  useEffect(() => {
    loadLogs();
  }, [filter]);

  const loadLogs = async () => {
    setLoading(true);
    if (backendMode) {
      const backend = await fetchLogs(filter);
      if (backend) {
        setLogs(backend as any);
        setLoading(false);
        return;
      }
    }
    let query = supabase
      .from('system_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (filter !== 'all') {
      query = query.eq('event_type', filter);
    }

    const { data } = await query;
    if (data) {
      setLogs(data);
    }
    setLoading(false);
  };

  const exportLogs = () => {
    const csv = [
      ['Timestamp', 'Type', 'Description'],
      ...logs.map(log => [
        new Date(log.created_at).toLocaleString(),
        log.event_type,
        log.description
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `system-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'auth': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300';
      case 'attendance': return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300';
      case 'security': return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300';
      case 'system': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'security': return '🔒';
      case 'attendance': return '✓';
      case 'auth': return '👤';
      case 'system': return '⚙️';
      default: return '📝';
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">System Activity Logs</h1>
          <p className="text-gray-600 dark:text-gray-400">Monitor all system events and activities</p>
        </div>
        <button
          onClick={exportLogs}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Download className="w-4 h-4" />
          Export Logs
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filter by type:</span>
          </div>
          <div className="flex gap-2">
            {(['all', 'auth', 'attendance', 'security', 'system'] as LogFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === f
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-12">
              <Activity className="w-8 h-8 mx-auto text-gray-400 animate-pulse mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="w-8 h-8 mx-auto text-gray-400 mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">No logs found</p>
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-slate-700 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
              >
                <span className="text-2xl">{getEventIcon(log.event_type)}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getEventColor(log.event_type)}`}>
                      {log.event_type.toUpperCase()}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-900 dark:text-white">{log.description}</p>
                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                    <details className="mt-2">
                      <summary className="text-xs text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-800 dark:hover:text-gray-200">
                        View metadata
                      </summary>
                      <pre className="mt-2 p-2 bg-gray-100 dark:bg-slate-800 rounded text-xs overflow-x-auto">
                        {JSON.stringify(log.metadata, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {logs.length > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-slate-600">
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
              Showing {logs.length} log {logs.length === 1 ? 'entry' : 'entries'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
