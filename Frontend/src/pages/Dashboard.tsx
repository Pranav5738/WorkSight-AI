import { useEffect, useState } from "react";
// Corrected import (original pointed to ../lib/database which does not exist)
import { supabase } from "../lib/supabase";
import { Users, Activity, LogIn } from "lucide-react";
import { isBackendConfigured, getAccessToken } from "../lib/api/http";

// Lightweight HTTP helper for backend endpoints (avoids importing full API modules)
async function backendJson<T>(path: string): Promise<T | null> {
  try {
    const base = import.meta.env.VITE_API_URL;
    if (!base) return null;
    const token = getAccessToken();
    const res = await fetch(`${base}${path}`.replace(/(?<!:)\/+/g, '/'), {
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface Metric {
  title: string;
  value: number;
  icon: JSX.Element;
  color: string;
}

interface Log {
  id?: string;
  event_type: string;
  description: string;
  created_at: string;
}

interface DashboardProps {
  // Optional navigation callback passed from App so dashboard tiles can navigate
  onNavigate?: (page: string) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [userCount, setUserCount] = useState(0);
  const [attendanceCount, setAttendanceCount] = useState(0);
  const [recentLogs, setRecentLogs] = useState<Log[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    const backend = isBackendConfigured();
    if (backend) {
      // Parallel fetch from backend API
      const [employees, today, logs] = await Promise.all([
        backendJson<any[]>("/employees"),
        backendJson<any>("/attendance/today"),
        backendJson<any[]>("/logs?limit=5")
      ]);
      if (employees) setUserCount(employees.length);
      if (today && Array.isArray(today.records)) {
        setAttendanceCount(today.records.length || 0);
      } else if (today && Array.isArray(today)) {
        // fallback shape: list of attendance entries
        setAttendanceCount(today.length);
      }
      if (logs) setRecentLogs(logs.map(l => ({
        id: l.id || l.event_id,
        event_type: l.event_type || l.type || 'system',
        description: l.description || l.message || '',
        created_at: l.ts || l.created_at || new Date().toISOString()
      })));
      return;
    }

    // Supabase mode
  // Adjust table names to typical schema (employees, attendance_records, system_logs)
    const [{ count: users }, { count: attendance }, logsRes] = await Promise.all([
      supabase.from("employees").select("*", { count: "exact", head: true }),
      supabase.from("attendance_records").select("*", { count: "exact", head: true }),
      supabase
        .from("system_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5)
    ]);
    setUserCount(users || 0);
    setAttendanceCount(attendance || 0);
    setRecentLogs(logsRes.data || []);
  }

  const metrics: (Metric & { target?: string })[] = [
    {
      title: "Registered Users",
      value: userCount,
      icon: <Users className="w-6 h-6" />,
      color: "bg-blue-500",
      target: "users",
    },
    {
      title: "Attendance Records",
      value: attendanceCount,
      icon: <LogIn className="w-6 h-6" />,
      color: "bg-green-500",
      target: "attendance",
    },
    {
      title: "System Logs",
      value: recentLogs.length,
      icon: <Activity className="w-6 h-6" />,
      color: "bg-purple-500",
      target: "system", // could also be 'logs'
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
        Dashboard
      </h1>

      {/* Metrics grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {metrics.map((metric, index) => {
          const clickable = !!(onNavigate && metric.target);
          return (
            <button
              key={index}
              type={clickable ? "button" : undefined}
              disabled={!clickable}
              onClick={() => clickable && onNavigate!(metric.target!)}
              className={`text-left group relative bg-white dark:bg-slate-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-slate-700 transition ${
                clickable
                  ? 'hover:shadow-xl hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500'
                  : ''
              } ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
            >
              {clickable && (
                <span className="absolute top-2 right-2 text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-slate-700 text-blue-700 dark:text-blue-300 opacity-0 group-hover:opacity-100 transition">
                  View
                </span>
              )}
              <div className="flex items-center space-x-4">
                <div className={`${metric.color} p-3 rounded-lg text-white shadow-md`}>
                  {metric.icon}
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
                    {metric.title}
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {metric.value}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Recent Activity */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-slate-700">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
          Recent Activity
        </h2>
        <div className="space-y-3">
          {recentLogs.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
              No recent activity
            </p>
          ) : (
            recentLogs.map((log, index) => (
              <div
                key={log.id ?? `${log.created_at}-${index}`}
                className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-700 rounded-lg"
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    log.event_type === "security"
                      ? "bg-red-500"
                      : log.event_type === "attendance"
                      ? "bg-green-500"
                      : log.event_type === "auth"
                      ? "bg-blue-500"
                      : "bg-gray-500"
                  }`}
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {log.description}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(log.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
