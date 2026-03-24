import { useEffect, useState, useRef } from 'react';
import { CheckCircle, XCircle, Clock, Download, Brain } from 'lucide-react';
import { CameraView } from '../components/CameraView';
import { fetchAppPreferences } from '../lib/api/settings';
import { Toast } from '../components/Toast';
import { supabase } from '../lib/supabase';
import type { Employee, AttendanceRecord, SystemLog } from '../types/database';
import { isBackendConfigured } from '../lib/api/http';
import { fetchTodayAttendance, markAttendanceBackend, deleteAttendanceRecord } from '../lib/api/attendance';
import { identifyFace } from '../lib/api/recognition';
import { logEvent } from '../lib/api/logs';

type AttendanceStatus = 'present' | 'absent' | 'late' | 'on_leave';

interface EmployeeWithAttendance extends Employee {
  attendance?: AttendanceRecord | null;
}

export function AttendanceSystem() {
  const [employees, setEmployees] = useState<EmployeeWithAttendance[]>([]);
  const [filter, setFilter] = useState<'all' | AttendanceStatus>('all');
  const [scanning, setScanning] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const backendMode = isBackendConfigured();
  const [backendError, setBackendError] = useState(false);
  const geminiEnabled = !!import.meta.env.VITE_GEMINI_API_KEY;
  // Optional: allow demo auto-mark when recognition fails (off by default)
  const allowSimulateAutoMark = import.meta.env.VITE_SIMULATE_AUTOMARK === '1';
  // Gemini tuning controls
  const [recognitionThreshold, setRecognitionThreshold] = useState(0.55); // 55%
  const [minIntervalMs, setMinIntervalMs] = useState(4000); // 4s between recognition calls
  const [assignedRecognitionCam, setAssignedRecognitionCam] = useState<string | null>(null);
  const lastCallRef = useRef<number>(0);
  const inFlightRef = useRef(false);
  const [lastRecognition, setLastRecognition] = useState<{ employeeId?: string; confidence: number; method?: string } | null>(null);
  // Demo auto-mark cycle (optional): marks first absent every 10s when enabled
  const demoEnabled = import.meta.env.VITE_ATTENDANCE_DEMO === '1';
  useEffect(() => {
    if (!demoEnabled || backendMode) return;
    const id = setInterval(async () => {
      const absent = employees.find(e => !e.attendance);
      if (absent) {
        await markAttendance(absent);
      }
    }, 10000);
    return () => clearInterval(id);
  }, [demoEnabled, backendMode, employees]);

  useEffect(() => {
    loadEmployees();
  }, []);

  // If the backend wasn't ready on first load, auto-retry once shortly after to clear the banner
  useEffect(() => {
    if (backendMode && backendError) {
      const t = setTimeout(() => {
        loadEmployees();
      }, 2000);
      return () => clearTimeout(t);
    }
  }, [backendMode, backendError]);

  // Fetch assigned recognition camera (one-off on mount)
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const prefs = await fetchAppPreferences();
        if (active) {
          if (prefs?.camera_assignments?.recognition) {
            setAssignedRecognitionCam(prefs.camera_assignments.recognition);
          }
        }
      } catch { /* ignore */ }
    })();
    return () => { active = false; };
  }, []);

  const loadEmployees = async () => {
    const today = new Date().toISOString().split('T')[0];

    // Try backend consolidated endpoint first
    if (backendMode) {
      const backendData = await fetchTodayAttendance();
      if (backendData && backendData.employees) {
        setEmployees(backendData.employees as any);
        setBackendError(false);
        return;
      } else {
        setBackendError(true);
      }
    }

    const { data: empData } = await supabase
      .from('employees')
      .select('*')
      .eq('status', 'active');

    const { data: attData } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('date', today);

    if (empData) {
      const employeesWithAttendance = (empData as Employee[]).map((emp) => ({
        ...emp,
  attendance: attData?.find((att: any) => (att as AttendanceRecord).employee_id === emp.id) || null
      }));
      setEmployees(employeesWithAttendance);
    }
  };

  const handleFrameCapture = async (imageData?: string) => {
    if (scanning) return;
    setScanning(true);
    try {
      const absentEmployees = employees.filter(emp => !emp.attendance);
      if (absentEmployees.length === 0) return;

      let recognized = false;
      if (imageData) {
        const now = Date.now();
        const tooSoon = (now - lastCallRef.current) < minIntervalMs;
        if (!inFlightRef.current && !tooSoon) {
          inFlightRef.current = true;
          lastCallRef.current = now;
          // Prefer external employee_id for backend alignment; fall back to internal id
          const roster = employees.map(e => ({ id: (e as any).employee_id || e.id, full_name: e.full_name, photo_url: (e as any).photo_url }));
          const result = await identifyFace(imageData, roster, recognitionThreshold);
          setLastRecognition({ employeeId: result.employeeId, confidence: result.confidence, method: result.method });
          inFlightRef.current = false;
          if (result.identified && result.employeeId && result.confidence >= recognitionThreshold) {
            const matched = employees.find(e => (e as any).employee_id === result.employeeId || e.id === result.employeeId);
            if (matched && !matched.attendance) {
              await markAttendance(matched);
              setToast({
                message: `${matched.full_name} recognized (${(result.confidence * 100).toFixed(0)}%)`,
                type: 'success'
              });
              recognized = true;
            }
          }
        }
      }
      // If not recognized, do not auto-mark anyone unless explicit demo flag is enabled
      if (!recognized && allowSimulateAutoMark && !geminiEnabled && !backendMode) {
        const randomEmployee = absentEmployees[Math.floor(Math.random() * absentEmployees.length)];
        await markAttendance(randomEmployee);
      }
    } catch (err) {
      console.warn('[attendance] frame processing failed', err);
      inFlightRef.current = false;
    } finally {
      setScanning(false);
    }
  };

  const markAttendance = async (employee: Employee, manualStatus?: AttendanceStatus) => {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    // Try backend first when available
    if (backendMode) {
      const backendResult = await markAttendanceBackend({
        employee_id: (employee as any).employee_id || employee.id, // ensure external id
        status: manualStatus || 'present',
        method: manualStatus ? 'manual' : 'ai'
      });
      if (backendResult) {
        setToast({ message: `Attendance marked for ${employee.full_name}`, type: 'success' });
        await loadEmployees();
        return;
      }
    }

    const attendanceInsert: Partial<AttendanceRecord> = {
      employee_id: employee.id,
      date: today,
      check_in_time: now,
      status: manualStatus || 'present',
      marked_by: manualStatus ? 'manual' : 'ai'
    } as AttendanceRecord;

    const { data, error } = await (supabase.from('attendance_records') as any)
      .insert(attendanceInsert)
      .select()
      .single();

    if (data && !error) {
      setToast({
        message: `Attendance marked for ${employee.full_name}`,
        type: 'success'
      });

      const fallbackWrite = async () => {
        const log: Partial<SystemLog> = ({
          event_type: 'attendance',
          description: `Attendance marked for ${employee.full_name}`,
          metadata: { employee_id: employee.id, method: manualStatus ? 'manual' : 'ai' }
        }) as unknown as SystemLog;
        await (supabase.from('system_logs') as any).insert(log);
      };
      const wrote = await logEvent({ event_type: 'attendance', description: `Attendance marked for ${employee.full_name}`, metadata: { employee_id: employee.id, method: manualStatus ? 'manual' : 'ai' } });
      if (!wrote) await fallbackWrite();

      loadEmployees();
    }
  };

  const exportAttendance = () => {
    const csv = [
      ['Employee ID', 'Name', 'Department', 'Status', 'Check-in Time'],
      ...employees.map(emp => [
        emp.employee_id,
        emp.full_name,
        emp.department || '',
        emp.attendance?.status || 'absent',
        emp.attendance?.check_in_time ? new Date(emp.attendance.check_in_time).toLocaleTimeString() : '-'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    setToast({ message: 'Attendance exported successfully', type: 'success' });
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'present': return 'text-green-600 bg-green-100 dark:bg-green-900/20';
      case 'late': return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/20';
      case 'on_leave': return 'text-blue-600 bg-blue-100 dark:bg-blue-900/20';
      default: return 'text-red-600 bg-red-100 dark:bg-red-900/20';
    }
  };

  const filteredEmployees = employees.filter(emp => {
    if (filter === 'all') return true;
    const status = emp.attendance?.status || 'absent';
    return status === filter;
  });

  const stats = {
    present: employees.filter(e => e.attendance?.status === 'present').length,
    absent: employees.filter(e => !e.attendance).length,
    late: employees.filter(e => e.attendance?.status === 'late').length
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">AI Attendance System</h1>
          <p className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
            Automated facial recognition attendance tracking
            {geminiEnabled ? (
              <span
                data-testid="recognition-mode-badge"
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
              >
                <Brain className="w-3 h-3" /> Gemini
              </span>
            ) : (
              <span
                data-testid="recognition-mode-badge"
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
              >
                Simulation
              </span>
            )}
          </p>
        </div>
        <button
          onClick={exportAttendance}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Download className="w-4 h-4" />
          Export
        </button>
      </div>

      {backendMode && backendError && (
        <div className="p-3 border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-600 rounded-lg text-amber-800 dark:text-amber-300 text-xs flex items-center justify-between gap-2">
          <span>Backend API unreachable – operating in Supabase fallback mode.</span>
          <button
            onClick={() => loadEmployees()}
            className="px-2 py-1 rounded bg-amber-600/90 hover:bg-amber-600 text-white text-[11px]"
          >Retry</button>
        </div>
      )}

      {geminiEnabled && (
        <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium text-gray-700 dark:text-gray-300">Recognition Settings</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">Threshold {(recognitionThreshold*100).toFixed(0)}%</span>
          </div>
          <label className="flex items-center gap-3">
            <input
              type="range"
              min={0.3}
              max={0.9}
              step={0.01}
              value={recognitionThreshold}
              onChange={(e) => setRecognitionThreshold(parseFloat(e.target.value))}
              className="w-full accent-blue-600"
            />
          </label>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">Min Interval (s)</span>
              <input
                type="number"
                min={1}
                max={30}
                value={(minIntervalMs/1000).toFixed(0)}
                onChange={(e) => setMinIntervalMs(Math.min(30000, Math.max(1000, (parseInt(e.target.value || '1', 10) * 1000))))}
                className="w-20 px-2 py-1 text-xs rounded border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-800 dark:text-gray-200"
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Higher threshold = fewer matches; increase interval to reduce API cost.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div data-testid="stat-present" className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle className="w-6 h-6 text-green-600" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Present</h3>
          </div>
          <p data-testid="stat-present-count" className="text-3xl font-bold text-green-600 dark:text-green-400">{stats.present}</p>
        </div>

        <div data-testid="stat-absent" className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-3 mb-2">
            <XCircle className="w-6 h-6 text-red-600" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Absent</h3>
          </div>
          <p data-testid="stat-absent-count" className="text-3xl font-bold text-red-600 dark:text-red-400">{stats.absent}</p>
        </div>

        <div data-testid="stat-late" className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-3 mb-2">
            <Clock className="w-6 h-6 text-yellow-600" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Late</h3>
          </div>
          <p data-testid="stat-late-count" className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">{stats.late}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-slate-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">AI Recognition Camera</h2>
          <CameraView
            className="aspect-video mb-4"
            onFrame={handleFrameCapture}
            captureInterval={5000}
            autoStart={false}
            targetDeviceId={assignedRecognitionCam || undefined}
          />

          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
            <p className="text-sm text-blue-900 dark:text-blue-300 font-medium mb-2">AI Status:</p>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${scanning ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`} />
              <span className="text-sm text-blue-800 dark:text-blue-200">
                {scanning ? 'Scanning for faces...' : 'Ready to scan'}
              </span>
            </div>
            {lastRecognition && (
              <div className="mt-2 text-[11px] text-blue-800/80 dark:text-blue-300/80" data-testid="last-recognition">
                Last recognition: {lastRecognition.employeeId || 'none'} @ {(lastRecognition.confidence*100).toFixed(0)}% ({lastRecognition.method || 'n/a'})
              </div>
            )}
          </div>

          <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
            <p className="text-xs font-medium text-yellow-900 dark:text-yellow-300 mb-2">
              Recognition Setup:
            </p>
            <ol className="text-xs text-yellow-800 dark:text-yellow-200 space-y-1 list-decimal list-inside">
              <li>Get API key from Google AI Studio</li>
              <li>Configure backend /recognition/identify or add VITE_GEMINI_API_KEY</li>
              <li>Install @google/generative-ai (if using direct Gemini)</li>
              <li>Adjust threshold & interval below</li>
            </ol>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Employee List</h2>
            <div className="flex gap-2">
              {['all', 'present', 'absent', 'late'].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f as typeof filter)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
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

          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {filteredEmployees.map((employee) => (
              <div
                key={employee.id}
                className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-700 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
              >
                <img
                  src={employee.photo_url || 'https://via.placeholder.com/50'}
                  alt={employee.full_name}
                  className="w-12 h-12 rounded-full object-cover"
                />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{employee.full_name}</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{employee.department}</p>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(employee.attendance?.status)}`}>
                    {employee.attendance?.status || 'absent'}
                  </span>
                  {employee.attendance?.check_in_time && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {new Date(employee.attendance.check_in_time).toLocaleTimeString()}
                    </p>
                  )}
                  {!employee.attendance && (
                    <button
                      onClick={() => markAttendance(employee, 'present')}
                      className="mt-1 px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-medium"
                    >Mark</button>
                  )}
                  {employee.attendance?.id && (
                    <button
                      onClick={async () => {
                        const prev = employees;
                        setEmployees(prev => prev.map(e => e.id === employee.id ? ({ ...e, attendance: undefined }) : e));
                        const ok = await deleteAttendanceRecord(employee.attendance!.id!);
                        if (!ok) {
                          setEmployees(prev);
                          setToast({ message: 'Delete attendance failed', type: 'error' });
                        } else {
                          setToast({ message: 'Attendance entry deleted', type: 'success' });
                        }
                      }}
                      className="mt-1 px-2 py-0.5 rounded bg-red-600 hover:bg-red-700 text-white text-[10px] font-medium"
                    >Delete</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
