import { useState, useRef, useEffect, useCallback } from 'react';
import { CameraView } from '../components/CameraView';
import { supabase } from '../lib/supabase';
import type { Employee, SystemLog } from '../types/database';
import { Check, Loader2, UserPlus, Upload, FileSpreadsheet, RotateCcw } from 'lucide-react';
import { isBackendConfigured } from '../lib/api/http';
import { createEmployee, bulkImportEmployees, getEmployee, encodeEmployee, EmployeeDTO } from '../lib/api/employees';
import { Toast } from '../components/Toast';
import { logEvent } from '../lib/api/logs';

interface NewEmployeeForm {
  full_name: string;
  employee_id: string;
  department: string;
  position: string;
  email: string;
  phone: string;
  photo_data?: string; // base64 snapshot
}

export function EnrollPage({ onCreated }: { onCreated?: (employeeId: string) => void } = {}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bulkFileInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState<NewEmployeeForm>({
    full_name: '',
    employee_id: '',
    department: '',
    position: '',
    email: '',
    phone: ''
  });
  const [captured, setCaptured] = useState<string | null>(null);
  const [captures, setCaptures] = useState<string[]>([]);
  const [showRetake, setShowRetake] = useState(false);
  const [idExists, setIdExists] = useState<boolean | null>(null);
  const [validatingId, setValidatingId] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [downscale, setDownscale] = useState(true);
  const [imgInfo, setImgInfo] = useState<{w:number;h:number;kb:number} | null>(null);
  const [status, setStatus] = useState<'idle' | 'capturing' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [bulkEmployees, setBulkEmployees] = useState<NewEmployeeForm[]>([]);
  const [bulkStatus, setBulkStatus] = useState<'idle' | 'parsing' | 'ready' | 'importing' | 'done' | 'failed'>('idle');
  const [bulkMessage, setBulkMessage] = useState<string>('');
  const [encodingTrack, setEncodingTrack] = useState<{ employee_id: string; status: string; attempts: number; lastCheck?: string; error?: string } | null>(null);
  const encodingIntervalRef = useRef<number | null>(null);

  const handleChange = (field: keyof NewEmployeeForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleFrame = (img: string) => {
    if (status === 'capturing') {
      setCaptured(img);
      setForm(prev => ({ ...prev, photo_data: img }));
      setStatus('idle');
    }
  };

  const capturePhoto = () => {
    setCaptured(null);
    setShowRetake(false);
    setStatus('capturing');
  };

  const triggerPhotoUpload = () => fileInputRef.current?.click();

  const processImage = async (dataUrl: string) => {
    let finalUrl = dataUrl;
    try {
      if (downscale) {
        const img = document.createElement('img');
        await new Promise(res => { img.onload = res; img.src = dataUrl; });
        const maxDim = 640;
        if (img.width > maxDim || img.height > maxDim) {
          const scale = Math.min(maxDim / img.width, maxDim / img.height);
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img,0,0,canvas.width,canvas.height);
            finalUrl = canvas.toDataURL('image/jpeg', 0.85);
          }
        }
        setImgInfo({ w: img.width, h: img.height, kb: Math.round((finalUrl.length * 3 / 4)/1024) });
      } else {
        setImgInfo({ w: 0, h: 0, kb: Math.round((dataUrl.length * 3 / 4)/1024) });
      }
    } catch { /* ignore */ }
    setCaptured(finalUrl);
    setForm(prev => ({ ...prev, photo_data: finalUrl }));
    setShowRetake(true);
  };

  const handlePhotoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      processImage(result);
    };
    reader.readAsDataURL(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => processImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const onPaste = (e: ClipboardEvent) => {
    const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'));
    if (item) {
      const file = item.getAsFile();
      if (file) {
        const reader = new FileReader();
        reader.onload = () => processImage(reader.result as string);
        reader.readAsDataURL(file);
      }
    }
  };

  useEffect(() => {
    window.addEventListener('paste', onPaste as any);
    return () => window.removeEventListener('paste', onPaste as any);
  }, []);

  const validateId = useCallback(async (value: string) => {
    if (!value.trim()) { setIdExists(null); return; }
    setValidatingId(true);
    const existing = await getEmployee(value.trim());
    setIdExists(!!existing);
    setValidatingId(false);
  }, []);

  const requiredErrors = () => {
    const errs: Record<string,string> = {};
    if (!form.full_name.trim()) errs.full_name = 'Name required';
    if (!form.employee_id.trim()) errs.employee_id = 'Employee ID required';
    if (!captured) errs.photo_data = 'Photo required';
    if (idExists) errs.employee_id = 'Employee ID already exists';
    return errs;
  };

  const errors = requiredErrors();
  const formValid = Object.keys(errors).length === 0 && status !== 'saving';

  const parseCSV = (text: string): NewEmployeeForm[] => {
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length === 0) return [];
    let startIdx = 0;
    const header = lines[0].toLowerCase();
    if (header.includes('employee_id') && header.includes('full_name')) startIdx = 1;
    const rows: NewEmployeeForm[] = [];
    for (let i = startIdx; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim());
      if (cols.length < 2) continue;
      rows.push({
        employee_id: cols[0] || '',
        full_name: cols[1] || '',
        department: cols[2] || '',
        position: cols[3] || '',
        email: cols[4] || '',
        phone: cols[5] || '',
        photo_data: undefined
      });
    }
    return rows;
  };

  const handleBulkFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkStatus('parsing');
    setBulkMessage('Parsing CSV...');
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const rows = parseCSV(text);
        if (rows.length === 0) {
          setBulkStatus('failed');
          setBulkMessage('No valid rows found in file.');
        } else {
          setBulkEmployees(rows);
          setBulkStatus('ready');
          setBulkMessage(`Loaded ${rows.length} rows.`);
        }
      } catch (err: any) {
        setBulkStatus('failed');
        setBulkMessage(err.message || 'Failed to parse file');
      }
    };
    reader.readAsText(file);
  };

  const triggerBulkFile = () => bulkFileInputRef.current?.click();

  const performBulkImport = async () => {
    if (bulkStatus !== 'ready' || bulkEmployees.length === 0) return;
    setBulkStatus('importing');
    setBulkMessage('Importing employees...');
    try {
      if (isBackendConfigured()) {
        const csv = 'employee_id,full_name,department,position,email,phone\n' +
          bulkEmployees.map(r => [r.employee_id, r.full_name, r.department, r.position, r.email, r.phone].join(',')).join('\n');
        const file = new File([csv], 'bulk_employees.csv', { type: 'text/csv' });
        const result = await bulkImportEmployees(file);
        setBulkStatus('done');
        setBulkMessage(`Imported ${result.imported} employees. Skipped: ${result.skipped}`);
      } else {
        const inserts = bulkEmployees.filter(r => r.employee_id && r.full_name).map(r => ({
          employee_id: r.employee_id,
            full_name: r.full_name,
            department: r.department || null,
            position: r.position || null,
            email: r.email || null,
            phone: r.phone || null,
            status: 'active'
        }));
        if (inserts.length === 0) throw new Error('No valid rows to import');
        const { error: insertError } = await (supabase.from('employees') as any).insert(inserts).select();
        if (insertError) throw insertError;
        const logPayload = { event_type: 'system', description: `Bulk import: ${inserts.length} employees added`, metadata: { count: inserts.length } };
        const wrote = await logEvent(logPayload);
        if (!wrote) {
          const log: Partial<SystemLog> = (logPayload as any) as SystemLog;
          await (supabase.from('system_logs') as any).insert(log);
        }
        setBulkStatus('done');
        setBulkMessage(`Successfully imported ${inserts.length} employees.`);
      }
    } catch (err: any) {
      setBulkStatus('failed');
      setBulkMessage(err.message || 'Bulk import failed');
    }
  };

  const resetBulk = () => {
    setBulkEmployees([]);
    setBulkStatus('idle');
    setBulkMessage('');
    if (bulkFileInputRef.current) bulkFileInputRef.current.value = '';
  };

  const canSave = formValid;

  const saveEmployee = async () => {
    if (!canSave) return;
    setStatus('saving');
    setError(null);
    try {
      if (isBackendConfigured()) {
        const created = await createEmployee({
          employee_id: form.employee_id,
          full_name: form.full_name,
          department: form.department,
          position: form.position,
          email: form.email,
          phone: form.phone,
          photoDataUrl: form.photo_data
        });
        onCreated?.(created.employee_id);
        if (created.encoding_status && created.encoding_status !== 'no-photo') {
          setEncodingTrack({ employee_id: created.employee_id, status: created.encoding_status, attempts: 0 });
        }
      } else {
        const employeeInsert: Partial<Employee> = ({
          employee_id: form.employee_id,
          full_name: form.full_name,
          department: form.department || null,
          position: form.position || null,
          email: form.email || null,
          phone: form.phone || null,
          photo_url: form.photo_data || null,
          status: 'active'
        }) as unknown as Employee;
        const { data: inserted, error: insertError } = await (supabase.from('employees') as any).insert(employeeInsert).select().single();
        if (insertError) throw insertError;
        const logPayload = { event_type: 'system', description: `New employee enrolled: ${form.full_name} (${form.employee_id})`, metadata: { employee_id: form.employee_id } };
        const wrote = await logEvent(logPayload);
        if (!wrote) {
          const log: Partial<SystemLog> = (logPayload as any) as SystemLog;
          await (supabase.from('system_logs') as any).insert(log);
        }
        if (inserted?.employee_id) onCreated?.(inserted.employee_id);
      }
      setStatus('saved');
      setToast({ message: 'Employee enrolled', type: 'success' });
      setTimeout(() => setStatus('idle'), 2500);
      // don't immediately reset form so user can see encoding status; reset after encoding ready
      if (!encodingTrack) {
        setTimeout(() => {
          setForm({ full_name: '', employee_id: '', department: '', position: '', email: '', phone: '' });
          setCaptured(null);
          setCaptures([]);
          setIdExists(null);
        }, 800);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to save employee');
      setStatus('error');
      setToast({ message: 'Failed to enroll employee', type: 'error' });
    }
  };

  // Poll encoding status if tracking
  useEffect(() => {
    if (!encodingTrack || !isBackendConfigured()) return;
    if (encodingIntervalRef.current) window.clearInterval(encodingIntervalRef.current);
    const poll = async () => {
      const emp: EmployeeDTO | null = await getEmployee(encodingTrack.employee_id);
      if (!emp) return;
      const newStatus = emp.encoding_status || 'unknown';
      setEncodingTrack(prev => prev ? { ...prev, status: newStatus, lastCheck: new Date().toISOString(), error: emp.encoding_error, attempts: prev.attempts + 1 } : prev);
      if (['ready','failed','no-photo'].includes(newStatus)) {
        if (encodingIntervalRef.current) window.clearInterval(encodingIntervalRef.current);
        setToast({ message: newStatus === 'ready' ? 'Encoding ready' : newStatus === 'failed' ? 'Encoding failed' : 'No photo for embedding', type: newStatus === 'ready' ? 'success' : 'error' });
        // Reset form after a short delay
        setTimeout(() => {
          setForm({ full_name: '', employee_id: '', department: '', position: '', email: '', phone: '' });
          setCaptured(null);
          setCaptures([]);
          setIdExists(null);
          setEncodingTrack(null);
        }, 1200);
      }
    };
    poll();
    encodingIntervalRef.current = window.setInterval(poll, 1500);
    return () => { if (encodingIntervalRef.current) window.clearInterval(encodingIntervalRef.current); };
  }, [encodingTrack]);

  const cancelEncodingTracking = () => {
    if (encodingIntervalRef.current) window.clearInterval(encodingIntervalRef.current);
    setEncodingTrack(null);
  };

  const retryEncoding = async () => {
    if (!encodingTrack) return;
    const r = await encodeEmployee(encodingTrack.employee_id);
    if (r) {
      setEncodingTrack(prev => prev ? { ...prev, status: 'pending', attempts: 0, error: undefined } : prev);
      setToast({ message: 'Re-encode queued', type: 'success' });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><UserPlus className="w-6 h-6" /> Enroll Employee</h1>
        <div className="flex items-center gap-2 text-sm">
          <button onClick={()=>setMode('single')} className={`px-3 py-1 rounded-lg font-medium ${mode==='single' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}>Single</button>
          <button onClick={()=>setMode('bulk')} className={`px-3 py-1 rounded-lg font-medium ${mode==='bulk' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}>Bulk Import</button>
        </div>
        <div className="flex gap-2">
          {mode==='single' && (<>
            <button
              onClick={capturePhoto}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
              disabled={status === 'capturing'}
            >
              {status === 'capturing' ? 'Capturing...' : 'Capture Photo'}
            </button>
            <button
              onClick={triggerPhotoUpload}
              type="button"
              className="px-4 py-2 rounded-lg text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-2"
            >
              <Upload className="w-4 h-4" /> Upload Photo
            </button>
            <button
              onClick={saveEmployee}
              disabled={!canSave}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 flex items-center gap-2"
            >
              {status === 'saving' && <Loader2 className="w-4 h-4 animate-spin" />}
              {status === 'saved' ? <><Check className="w-4 h-4" /> Saved</> : 'Save'}
            </button>
          </>)}
          {mode==='bulk' && (
            <>
              <button onClick={triggerBulkFile} className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" /> Select CSV</button>
              <button onClick={performBulkImport} disabled={bulkStatus!=='ready'} className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-700 text-white disabled:opacity-50">Import</button>
              <button onClick={resetBulk} className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300 flex items-center gap-1"><RotateCcw className="w-4 h-4" />Reset</button>
            </>
          )}
        </div>
      </div>
      {mode==='single' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Camera</h2>
            <div
              onDragOver={e => { e.preventDefault(); }}
              onDrop={onDrop}
              className="relative group"
            >
              <CameraView className="aspect-video" onFrame={handleFrame} captureInterval={1500} />
              <div className="absolute inset-0 pointer-events-none flex items-start justify-end p-2">
                <div className="text-[10px] bg-black/50 text-white px-2 py-1 rounded opacity-70 group-hover:opacity-100 transition">Drop / Paste image</div>
              </div>
            </div>
            {captured && (
              <div className="mt-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Captured / Uploaded Snapshot:</p>
                <img src={captured} alt="Captured" className="w-48 rounded-lg border border-gray-200 dark:border-slate-700" />
                {showRetake && (
                  <div className="mt-2 flex items-center gap-2">
                    <button type="button" onClick={() => { setCaptures(prev => [...prev, captured]); capturePhoto(); }} className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium">Retake</button>
                    {captures.length > 0 && <button type="button" onClick={() => { const last = captures[captures.length-1]; setCaptured(last); setForm(prev => ({...prev, photo_data: last})); setCaptures(prev => prev.slice(0,-1)); }} className="px-3 py-1.5 rounded bg-gray-200 dark:bg-slate-600 text-gray-800 dark:text-gray-100 text-xs font-medium">Undo Retake</button>}
                  </div>
                )}
                {imgInfo && <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">Image: {imgInfo.w}x{imgInfo.h} ~ {imgInfo.kb} KB</p>}
              </div>
            )}
            {status === 'capturing' && (
              <p className="text-xs text-blue-600 dark:text-blue-400">Waiting for next frame...</p>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoFile} />
            <div className="mt-3 flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
              <label className="flex items-center gap-1 cursor-pointer select-none">
                <input type="checkbox" checked={downscale} onChange={e=>setDownscale(e.target.checked)} className="rounded" /> Downscale large images
              </label>
              <span>{captures.length} extra capture{captures.length===1?'':'s'}</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-slate-700 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Employee Info</h2>
            {encodingTrack && (
              <div className="mb-2 p-3 rounded-lg border text-xs flex flex-col gap-2 bg-gray-50 dark:bg-slate-700/40 border-gray-200 dark:border-slate-600">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Encoding Status</span>
                  <span className={`px-2 py-0.5 rounded-full capitalize ${
                    encodingTrack.status === 'ready' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                    encodingTrack.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                    encodingTrack.status === 'encoding' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                    encodingTrack.status === 'pending' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                    encodingTrack.status === 'no-photo' ? 'bg-gray-200 text-gray-700 dark:bg-slate-600 dark:text-gray-300' : 'bg-gray-200 text-gray-700 dark:bg-slate-600 dark:text-gray-300'
                  }`}>{encodingTrack.status}</span>
                </div>
                {encodingTrack.error && <p className="text-red-600 dark:text-red-400">{encodingTrack.error}</p>}
                <div className="flex items-center gap-2 flex-wrap">
                  {['pending','encoding'].includes(encodingTrack.status) && <span className="text-gray-500 dark:text-gray-300">Polling...</span>}
                  {encodingTrack.status === 'failed' && <button onClick={retryEncoding} className="px-2 py-1 text-[11px] rounded bg-blue-600 text-white">Retry</button>}
                  {encodingTrack.status === 'ready' && <button onClick={retryEncoding} className="px-2 py-1 text-[11px] rounded bg-indigo-600 text-white">Re-encode</button>}
                  <button onClick={cancelEncodingTracking} className="px-2 py-1 text-[11px] rounded bg-gray-300 dark:bg-slate-600 text-gray-800 dark:text-gray-100">Dismiss</button>
                  <span className="text-[10px] text-gray-400">Checks: {encodingTrack.attempts}</span>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1 text-gray-600 dark:text-gray-300">Full Name</label>
                <input value={form.full_name} onChange={e=>handleChange('full_name', e.target.value)} className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-slate-700 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" placeholder="Jane Doe" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-gray-600 dark:text-gray-300">Employee ID</label>
                <div className="relative">
                  <input
                    value={form.employee_id}
                    onChange={e=>{ handleChange('employee_id', e.target.value); setIdExists(null); }}
                    onBlur={()=>validateId(form.employee_id)}
                    className={`w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-slate-700 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 ${idExists ? 'ring-red-500' : 'focus:ring-blue-500'}`}
                    placeholder="EMP-001"
                  />
                  {validatingId && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-500">Checking...</span>}
                  {idExists === true && !validatingId && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-red-600">Exists</span>}
                  {idExists === false && !validatingId && form.employee_id && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-green-600">OK</span>}
                </div>
                {errors.employee_id && <p className="mt-1 text-[10px] text-red-600 dark:text-red-400">{errors.employee_id}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-gray-600 dark:text-gray-300">Department</label>
                <input value={form.department} onChange={e=>handleChange('department', e.target.value)} className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-slate-700 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" placeholder="Engineering" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-gray-600 dark:text-gray-300">Position</label>
                <input value={form.position} onChange={e=>handleChange('position', e.target.value)} className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-slate-700 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" placeholder="Developer" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-gray-600 dark:text-gray-300">Email</label>
                <input value={form.email} onChange={e=>handleChange('email', e.target.value)} className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-slate-700 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" placeholder="name@example.com" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-gray-600 dark:text-gray-300">Phone</label>
                <input value={form.phone} onChange={e=>handleChange('phone', e.target.value)} className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-slate-700 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" placeholder="+1 555 123 456" />
              </div>
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            {status === 'saved' && <p className="text-sm text-green-600 dark:text-green-400">Employee saved successfully.</p>}
            {errors.full_name && <p className="text-xs text-red-600 dark:text-red-400">{errors.full_name}</p>}
            {errors.photo_data && <p className="text-xs text-red-600 dark:text-red-400">{errors.photo_data}</p>}
            <p className="text-xs text-gray-500 dark:text-gray-400">Note: For production, upload the image to Supabase Storage and store the public URL instead of embedding base64.</p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={saveEmployee}
                disabled={!canSave}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 flex items-center gap-2"
              >
                {status === 'saving' && <Loader2 className="w-4 h-4 animate-spin" />}
                {status === 'saved' ? 'Saved' : 'Save Employee'}
              </button>
              <button
                type="button"
                onClick={() => { setForm({ full_name: '', employee_id: '', department: '', position: '', email: '', phone: '' }); setCaptured(null); setCaptures([]); setIdExists(null); setError(null); }}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-300 dark:bg-slate-600 text-gray-800 dark:text-gray-200"
              >Reset</button>
            </div>
          </div>
        </div>
      )}

      {mode==='bulk' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Bulk Import (CSV)</h2>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">Format: <code className="font-mono">employee_id,full_name,department,position,email,phone</code>. Header row optional.</p>
            <input ref={bulkFileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleBulkFile} />
            <div className="flex flex-wrap gap-3 mb-4">
              <button onClick={triggerBulkFile} className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white">Choose File</button>
              <button onClick={performBulkImport} disabled={bulkStatus!=='ready'} className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-700 text-white disabled:opacity-50">Import</button>
              <button onClick={resetBulk} className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300">Reset</button>
              <button onClick={() => {
                const template = 'employee_id,full_name,department,position,email,phone\nE100,Jane Doe,Engineering,Engineer,jane@example.com,555-1111';
                const blob = new Blob([template], { type: 'text/csv' });
                const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='employees_template.csv'; a.click(); URL.revokeObjectURL(url);
                setToast({ message: 'Template downloaded', type: 'success' });
              }} className="px-4 py-2 rounded-lg text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white">Template</button>
            </div>
            {bulkMessage && <p className={`text-sm ${bulkStatus==='failed' ? 'text-red-600 dark:text-red-400' : bulkStatus==='done' ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>{bulkMessage}</p>}
            {bulkEmployees.length>0 && (
              <div className="mt-4 overflow-x-auto max-h-96 border border-gray-200 dark:border-slate-700 rounded-lg">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Employee ID</th>
                      <th className="px-3 py-2 text-left font-semibold">Full Name</th>
                      <th className="px-3 py-2 text-left font-semibold">Department</th>
                      <th className="px-3 py-2 text-left font-semibold">Position</th>
                      <th className="px-3 py-2 text-left font-semibold">Email</th>
                      <th className="px-3 py-2 text-left font-semibold">Phone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkEmployees.map((r,i)=>{
                      const invalid = !r.employee_id || !r.full_name;
                      return (
                        <tr key={i} className={`border-t border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 ${invalid ? 'bg-red-50 dark:bg-red-900/20' : ''}`}>
                          <td className="px-3 py-1">{r.employee_id || <span className="text-red-600">Missing</span>}</td>
                          <td className="px-3 py-1">{r.full_name || <span className="text-red-600">Missing</span>}</td>
                          <td className="px-3 py-1">{r.department}</td>
                          <td className="px-3 py-1">{r.position}</td>
                          <td className="px-3 py-1">{r.email}</td>
                          <td className="px-3 py-1">{r.phone}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
      {toast && <Toast message={toast.message} type={toast.type} onClose={()=>setToast(null)} duration={3000} />}
    </div>
  );
}
