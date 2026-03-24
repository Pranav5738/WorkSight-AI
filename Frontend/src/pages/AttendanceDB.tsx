import { useEffect, useState } from 'react';
import { Toast } from '../components/Toast';
import { http } from '../lib/api/http';
import { updateAttendanceStatus, checkoutAttendance } from '../lib/api/attendance';
import { useConfirm } from '../components/ConfirmDialog';

// Minimal shared types
interface Employee {
  id?: string;
  employee_id: string;
  full_name: string;
  department?: string | null;
  position?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
}

interface AttendanceRecord {
  id: string;
  employee_id: string; // external employee_id
  date: string;
  check_in_time?: string | null;
  check_out_time?: string | null;
  status: string;
  marked_by?: string | null;
}

// Helpers to map DB payload used by backend /attendance/today
function normalizeAttendance(payload: any[]): AttendanceRecord[] {
  const out: AttendanceRecord[] = [];
  for (const row of payload || []) {
    if (row.attendance && row.attendance.employee_id) {
      out.push({
        id: row.attendance.id,
        employee_id: row.employee_id,
        date: row.attendance.date,
        check_in_time: row.attendance.check_in_time,
        check_out_time: row.attendance.check_out_time,
        status: row.attendance.status,
        marked_by: row.attendance.marked_by
      });
    }
  }
  return out;
}

export function AttendanceDB() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [editing, setEditing] = useState<Record<string, Partial<Employee>>>({});
  const { confirm, Dialog } = useConfirm();

  // Reserved: group attendance by employee if needed in future

  const load = async () => {
    setLoading(true);
    try {
      const emps = await http<Employee[]>('/employees');
      setEmployees(emps || []);
      const today = await http<any[]>('/attendance/today');
      if (Array.isArray(today)) setAttendance(normalizeAttendance(today));
    } catch (e) {
      setToast({ message: 'Failed to load data', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const saveEmployee = async (employee_id: string) => {
    const delta = editing[employee_id];
    if (!delta) return;
    try {
      const res = await http<Employee>(`/employees/${employee_id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(delta)
      });
      setEmployees(prev => prev.map(e => e.employee_id === employee_id ? { ...e, ...res } : e));
      setEditing(p => { const n = { ...p }; delete n[employee_id]; return n; });
      setToast({ message: 'Employee updated', type: 'success' });
    } catch {
      setToast({ message: 'Update failed', type: 'error' });
    }
  };

  const deleteEmployee = async (employee_id: string) => {
    const prev = employees;
    setEmployees(p => p.filter(e => e.employee_id !== employee_id));
    try {
      await http(`/employees/${employee_id}`, { method: 'DELETE' });
      setToast({ message: 'Employee deleted (and related data removed)', type: 'success' });
    } catch {
      setEmployees(prev);
      setToast({ message: 'Delete failed', type: 'error' });
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Attendance DB</h1>
        {loading && (
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-300 text-sm">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            Loading...
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow border border-gray-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-slate-700">
              <th className="text-left p-2">Employee ID</th>
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2">Department</th>
              <th className="text-left p-2">Position</th>
              <th className="text-left p-2">Email</th>
              <th className="text-left p-2">Phone</th>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && employees.length === 0 && Array.from({ length: 5 }).map((_, i) => (
              <tr key={`s-${i}`} className="border-b border-gray-100 dark:border-slate-700 animate-pulse">
                {Array.from({ length: 8 }).map((__, j) => (
                  <td key={j} className="p-2">
                    <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-24" />
                  </td>
                ))}
              </tr>
            ))}
            {employees.map(e => {
              const draft = editing[e.employee_id] || {};
              return (
                <tr key={e.employee_id} className="border-b border-gray-100 dark:border-slate-700">
                  <td className="p-2">{e.employee_id}</td>
                  <td className="p-2"><input value={draft.full_name ?? e.full_name} onChange={ev => setEditing(p => ({ ...p, [e.employee_id]: { ...p[e.employee_id], full_name: ev.target.value } }))} className="px-2 py-1 rounded border dark:bg-slate-700"/></td>
                  <td className="p-2"><input value={draft.department ?? e.department ?? ''} onChange={ev => setEditing(p => ({ ...p, [e.employee_id]: { ...p[e.employee_id], department: ev.target.value } }))} className="px-2 py-1 rounded border dark:bg-slate-700"/></td>
                  <td className="p-2"><input value={draft.position ?? e.position ?? ''} onChange={ev => setEditing(p => ({ ...p, [e.employee_id]: { ...p[e.employee_id], position: ev.target.value } }))} className="px-2 py-1 rounded border dark:bg-slate-700"/></td>
                  <td className="p-2"><input value={draft.email ?? e.email ?? ''} onChange={ev => setEditing(p => ({ ...p, [e.employee_id]: { ...p[e.employee_id], email: ev.target.value } }))} className="px-2 py-1 rounded border dark:bg-slate-700"/></td>
                  <td className="p-2"><input value={draft.phone ?? e.phone ?? ''} onChange={ev => setEditing(p => ({ ...p, [e.employee_id]: { ...p[e.employee_id], phone: ev.target.value } }))} className="px-2 py-1 rounded border dark:bg-slate-700"/></td>
                  <td className="p-2">
                    <select value={draft.status ?? e.status ?? 'active'} onChange={ev => setEditing(p => ({ ...p, [e.employee_id]: { ...p[e.employee_id], status: ev.target.value } }))} className="px-2 py-1 rounded border dark:bg-slate-700">
                      <option value="active">active</option>
                      <option value="inactive">inactive</option>
                    </select>
                  </td>
                  <td className="p-2 flex gap-2">
                    <button className="px-2 py-1 bg-blue-600 text-white rounded" onClick={() => saveEmployee(e.employee_id)}>Save</button>
                    <button
                      className="px-2 py-1 bg-red-600 text-white rounded"
                      onClick={async () => {
                        const ok = await confirm(`Delete employee ${e.employee_id}? This will remove their records.`);
                        if (!ok) return;
                        await deleteEmployee(e.employee_id);
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow border border-gray-200 dark:border-slate-700">
        <h2 className="font-semibold mb-2 text-gray-900 dark:text-white">Today Attendance</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700">
                <th className="text-left p-2">Employee ID</th>
                <th className="text-left p-2">Date</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Check In</th>
                <th className="text-left p-2">Marked By</th>
                <th className="text-left p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && attendance.length === 0 && Array.from({ length: 3 }).map((_, i) => (
                <tr key={`sa-${i}`} className="border-b border-gray-100 dark:border-slate-700 animate-pulse">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="p-2">
                      <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-24" />
                    </td>
                  ))}
                </tr>
              ))}
              {attendance.map(a => (
                <tr key={a.id} className="border-b border-gray-100 dark:border-slate-700">
                  <td className="p-2">{a.employee_id}</td>
                  <td className="p-2">{a.date}</td>
                  <td className="p-2">
                    <select
                      value={a.status}
                      onChange={async ev => {
                        const newStatus = ev.target.value;
                        const prev = [...attendance];
                        setAttendance(list => list.map(r => r.id === a.id ? { ...r, status: newStatus } : r));
                        const res = await updateAttendanceStatus(a.id, newStatus);
                        if (!res) { setAttendance(prev); setToast({ message: 'Update failed', type: 'error' }); }
                      }}
                      className="px-2 py-1 rounded border dark:bg-slate-700"
                    >
                      <option value="present">present</option>
                      <option value="late">late</option>
                      <option value="on_leave">on_leave</option>
                      <option value="absent">absent</option>
                    </select>
                  </td>
                  <td className="p-2">{a.check_in_time ? new Date(a.check_in_time).toLocaleTimeString() : '-'}</td>
                  <td className="p-2">{a.marked_by ?? '-'}</td>
                  <td className="p-2">
                    <button className="px-2 py-1 bg-emerald-600 text-white rounded"
                      onClick={async () => {
                        const res = await checkoutAttendance(a.employee_id);
                        if (res) { setToast({ message: 'Checked out', type: 'success' }); load(); } else { setToast({ message: 'Checkout failed', type: 'error' }); }
                      }}>Checkout</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {Dialog}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
