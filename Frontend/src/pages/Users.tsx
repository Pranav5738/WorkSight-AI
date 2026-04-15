import { useEffect, useMemo, useState, useRef } from 'react';
import { fetchEmployees, EmployeeDTO, updateEmployee, deleteEmployee as apiDeleteEmployee, encodeEmployee } from '../lib/api/employees';
import { useAuth } from '../contexts/AuthContext';
import { Toast } from '../components/Toast';
import { Search, UserPlus, Edit2, Trash2, Loader2, Filter } from 'lucide-react';
import { EnrollPage } from './Enroll';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

// Lightweight inline edit modal (simple & local state)
interface EditModalProps {
  employee: EmployeeDTO | null;
  onClose: () => void;
  onSave: (updates: Partial<EmployeeDTO>) => Promise<void>;
}

function EditEmployeeModal({ employee, onClose, onSave }: EditModalProps) {
  const [full_name, setFullName] = useState(employee?.full_name || '');
  const [department, setDepartment] = useState(employee?.department || '');
  const [photoPreview, setPhotoPreview] = useState<string | null>(employee?.photo_url || null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [saving, setSaving] = useState(false);

  if (!employee) return null;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave({ id: employee.id, full_name, department, photo_url: photoPreview || undefined });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg w-full max-w-md p-6 border border-gray-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Edit User</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Full Name</label>
            <input value={full_name} onChange={e => setFullName(e.target.value)} className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Department</label>
            <input value={department} onChange={e => setDepartment(e.target.value)} className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Photo</label>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-md overflow-hidden bg-gray-100 dark:bg-slate-700 flex items-center justify-center text-[10px] text-gray-500">
                {photoPreview ? (<img src={photoPreview} alt="preview" className="w-full h-full object-cover" />) : 'No Photo'}
              </div>
              <div className="flex flex-col gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium">Upload</button>
                {photoPreview && (
                  <button type="button" onClick={() => setPhotoPreview(null)} className="px-3 py-1.5 rounded bg-gray-200 dark:bg-slate-600 text-gray-700 dark:text-gray-200 text-xs font-medium">Remove</button>
                )}
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">JPEG/PNG small images recommended.</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-slate-600 text-gray-800 dark:text-gray-100">Cancel</button>
          <button disabled={saving} onClick={handleSave} className="px-4 py-2 rounded-md text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 disabled:opacity-60">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

// Delete confirm modal
function DeleteConfirm({ employee, onCancel, onConfirm }: { employee: EmployeeDTO | null; onCancel: () => void; onConfirm: () => Promise<void>; }) {
  const [busy, setBusy] = useState(false);
  if (!employee) return null;
  const go = async () => { setBusy(true); await onConfirm(); setBusy(false); };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg w-full max-w-sm p-6 border border-gray-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Delete User</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Are you sure you want to remove <span className="font-medium">{employee.full_name}</span>? This action cannot be undone.</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-slate-600 text-gray-800 dark:text-gray-100">Cancel</button>
          <button disabled={busy} onClick={go} className="px-4 py-2 rounded-md text-sm font-medium bg-red-600 hover:bg-red-700 text-white flex items-center gap-2 disabled:opacity-60">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export function UsersPage() {
  const [employees, setEmployees] = useState<EmployeeDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [showEnroll, setShowEnroll] = useState(false);
  const [editing, setEditing] = useState<EmployeeDTO | null>(null);
  const [deleting, setDeleting] = useState<EmployeeDTO | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 15;
  // const [error, setError] = useState<string | null>(null); // reserved for future error banner

  // Placeholder backend patch & delete until endpoints exist
  const patchEmployee = async (updates: Partial<EmployeeDTO>) => {
    if (!updates.id && !updates.employee_id) return;
    // Find current record to derive identifier (prefer employee_id)
    const current = employees.find(e => e.id === updates.id) || employees.find(e => e.employee_id === updates.employee_id);
    if (!current) return;
    const identifier = current.employee_id;
    const optimisticPrev = [...employees];
    setEmployees(prev => prev.map(e => e.employee_id === identifier ? { ...e, ...updates } : e));
    const apiRes = await updateEmployee(identifier, {
      full_name: updates.full_name,
      department: updates.department ?? undefined
    });
    if (!apiRes) {
      // rollback on failure
      setEmployees(optimisticPrev);
    } else {
      setEmployees(prev => prev.map(e => e.employee_id === identifier ? { ...e, ...apiRes } : e));
    }
  };
  const deleteEmployee = async (emp: EmployeeDTO) => {
    const identifier = emp.employee_id;
    const optimisticPrev = [...employees];
    setEmployees(prev => prev.filter(e => e.employee_id !== identifier));
    const ok = await apiDeleteEmployee(identifier);
    if (!ok) {
      // rollback
      setEmployees(optimisticPrev);
    }
  };

  const { isAuthenticated } = useAuth();

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const data = await fetchEmployees();
      if (data) setEmployees(data);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (isAuthenticated) loadEmployees();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    employees.forEach(e => { if (e.department) set.add(e.department); });
    return Array.from(set).sort();
  }, [employees]);

  const filtered = employees.filter(e => {
    const q = search.trim().toLowerCase();
    if (q && !(e.full_name.toLowerCase().includes(q) || e.employee_id.toLowerCase().includes(q))) return false;
    if (departmentFilter && e.department !== departmentFilter) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const exportCSV = () => {
    const rows = [
      ['employee_id','full_name','department','status'],
      ...filtered.map(e => [e.employee_id, e.full_name, e.department || '', e.status || 'active'])
    ].map(r => r.join(',')).join('\n');
    const blob = new Blob([rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'users-export.csv'; a.click();
    URL.revokeObjectURL(url);
    setToast({ message: 'Exported users CSV', type: 'success' });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Manage enrolled personnel, status, profile edits, and face-encoding actions."
        actions={
          <>
            <Button variant="secondary" onClick={exportCSV}>Export CSV</Button>
            <Button onClick={() => setShowEnroll(v => !v)} leadingIcon={<UserPlus className="w-4 h-4" />}>
              {showEnroll ? 'Close Enroll' : 'Add New User'}
            </Button>
          </>
        }
      />

      <Card>
        <CardTitle title="User Directory" subtitle="Search, filter, and maintain operational user data." />
        <div className="flex flex-col md:flex-row md:items-center gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              placeholder="Search by name or ID"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-gray-800 dark:text-gray-100"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={departmentFilter}
              onChange={e => setDepartmentFilter(e.target.value)}
              className="px-3 py-2 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm"
            >
              <option value="">All Departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700">
                <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">ID</th>
                <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Name</th>
                <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Department</th>
                <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Status</th>
                <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Encoding</th>
                <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-500 dark:text-gray-400">
                    <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Loading users...
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-500 dark:text-gray-400">No users found</td>
                </tr>
              )}
              {!loading && paginated.map(emp => (
                <tr key={emp.id || emp.employee_id} className="border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                  <td className="py-2 px-3 font-mono text-xs text-gray-600 dark:text-gray-300">{emp.employee_id}</td>
                  <td className="py-2 px-3 text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    {emp.photo_url ? (
                      <img src={emp.photo_url} alt="avatar" className="w-7 h-7 rounded object-cover border border-gray-300 dark:border-slate-600" />
                    ) : (
                      <span className="w-7 h-7 rounded bg-gray-200 dark:bg-slate-600 flex items-center justify-center text-[10px] text-gray-500">—</span>
                    )}
                    {emp.full_name}
                  </td>
                  <td className="py-2 px-3 text-gray-600 dark:text-gray-300">{emp.department || <span className="italic text-gray-400">—</span>}</td>
                  <td className="py-2 px-3">
                    <Button
                      onClick={() => {
                        const next = emp.status === 'active' ? 'inactive' : 'active';
                        patchEmployee({ id: emp.id, employee_id: emp.employee_id, status: next });
                        setToast({ message: `User ${next === 'active' ? 'activated' : 'deactivated'}`, type: 'success' });
                      }}
                      variant={emp.status === 'active' ? 'chip-active' : 'chip'}
                      size="sm"
                      className="h-7 px-2 rounded-full text-[11px]"
                    >
                      {emp.status || 'active'}
                    </Button>
                  </td>
                  <td className="py-2 px-3 text-xs">
                    {emp.encoding_status ? (
                      <div className="flex items-center gap-1">
                        <span className={`px-1.5 py-0.5 rounded-full capitalize ${
                          emp.encoding_status === 'ready' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                          emp.encoding_status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                          emp.encoding_status === 'encoding' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                          emp.encoding_status === 'pending' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                          'bg-gray-200 text-gray-700 dark:bg-slate-600 dark:text-gray-300'
                        }`}>{emp.encoding_status}</span>
                        {emp.encoding_status !== 'ready' && emp.encoding_status !== 'encoding' && emp.encoding_status !== 'no-photo' && (
                          <Button
                            title="Retry encode"
                            onClick={async ()=>{ const r = await encodeEmployee(emp.employee_id); if(r){ setToast({ message: 'Encoding queued', type: 'success' }); setTimeout(loadEmployees, 800);} }}
                            variant="icon"
                            className="h-6 w-6 border-none"
                          >↻</Button>
                        )}
                        {emp.encoding_status === 'ready' && (
                          <Button
                            title="Re-encode"
                            onClick={async ()=>{ const r = await encodeEmployee(emp.employee_id); if(r){ setToast({ message: 'Re-encode queued', type: 'success' }); setTimeout(loadEmployees, 800);} }}
                            variant="icon"
                            className="h-6 w-6 border-none"
                          >⟳</Button>
                        )}
                      </div>
                    ) : <span className="text-gray-400 italic">—</span>}
                  </td>
                  <td className="py-2 px-3 flex items-center gap-2">
                    <Button variant="icon" onClick={() => setEditing(emp)} className="text-blue-600" title="Edit user" aria-label="Edit user"><Edit2 className="w-4 h-4" /></Button>
                    <Button variant="icon" onClick={() => setDeleting(emp)} className="text-red-600" title="Delete user" aria-label="Delete user"><Trash2 className="w-4 h-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {showEnroll && (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
          <EnrollPage onCreated={async () => { await loadEmployees(); setToast({ message: 'User enrolled', type: 'success' }); }} />
        </div>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap text-xs text-gray-600 dark:text-gray-400">
        <div>Showing {paginated.length} of {filtered.length} users</div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Prev</Button>
          <span>Page {page} / {totalPages}</span>
          <Button variant="secondary" size="sm" disabled={page>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>Next</Button>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={()=>setToast(null)} duration={2500} />}

      <EditEmployeeModal employee={editing} onClose={() => setEditing(null)} onSave={patchEmployee} />
      <DeleteConfirm employee={deleting} onCancel={() => setDeleting(null)} onConfirm={async () => { if (deleting) { await deleteEmployee(deleting); setDeleting(null); } }} />
    </div>
  );
}
