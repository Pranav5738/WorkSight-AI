import { useEffect, useState } from "react";
// Corrected import (original pointed to ../lib/database which does not exist)
import { supabase } from "../lib/supabase";
import { Users, Activity, LogIn } from "lucide-react";
import { isBackendConfigured, getAccessToken } from "../lib/api/http";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Card, CardTitle } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { EmptyState, LoadingState } from "../components/ui/DataStates";

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    setLoading(true);
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
      setLoading(false);
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
    setLoading(false);
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
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="A unified operations view for attendance, users, and system health."
        actions={
          <Button variant="secondary" onClick={fetchDashboardData}>Refresh</Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric, index) => (
          <StatCard
            key={index}
            title={metric.title}
            value={metric.value}
            icon={metric.icon}
            tone={index === 0 ? 'info' : index === 1 ? 'success' : 'primary'}
            trendLabel="Live"
            onClick={metric.target && onNavigate ? () => onNavigate(metric.target!) : undefined}
          />
        ))}
      </div>

      <Card>
        <CardTitle
          title="Recent Activity"
          subtitle="Latest platform events from authentication, attendance, and security pipelines."
          action={<Button variant="ghost" size="sm" onClick={() => onNavigate?.('logs')}>Open Logs</Button>}
        />
        {loading ? (
          <LoadingState label="Loading dashboard activity..." />
        ) : recentLogs.length === 0 ? (
          <EmptyState
            title="No recent activity"
            subtitle="Activity will appear here as users interact with the system."
          />
        ) : (
          <div className="space-y-2">
            {recentLogs.map((log, index) => (
              <div
                key={log.id ?? `${log.created_at}-${index}`}
                className="flex items-start gap-3 rounded-xl border border-slate-200/70 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/70"
              >
                <div
                  className={`mt-1 h-2.5 w-2.5 rounded-full ${
                    log.event_type === "security"
                      ? "bg-rose-500"
                      : log.event_type === "attendance"
                      ? "bg-emerald-500"
                      : log.event_type === "auth"
                      ? "bg-sky-500"
                      : "bg-slate-400"
                  }`}
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{log.description}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{new Date(log.created_at).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
