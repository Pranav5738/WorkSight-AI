import { http, base64ToFile, isBackendConfigured } from './http';

export interface EmployeeDTO {
  id?: string;
  employee_id: string;
  full_name: string;
  department?: string | null;
  position?: string | null;
  email?: string | null;
  phone?: string | null;
  photo_url?: string | null;
  status?: string;
  created_at?: string;
  encoding_status?: 'pending' | 'encoding' | 'ready' | 'failed' | 'no-photo';
  embedding?: number[] | null;
  last_encoded_at?: string | null;
  encoding_error?: string;
}

export async function fetchEmployees(): Promise<EmployeeDTO[]> {
  return http<EmployeeDTO[]>('/employees');
}

export async function getEmployee(employee_id: string): Promise<EmployeeDTO | null> {
  try {
    return await http<EmployeeDTO>(`/employees/${encodeURIComponent(employee_id)}`, {
      suppressErrorEmit: true,
      suppressStatuses: [404]
    });
  } catch {
    return null;
  }
}

export interface CreateEmployeeInput {
  employee_id: string;
  full_name: string;
  department?: string;
  position?: string;
  email?: string;
  phone?: string;
  photoDataUrl?: string; // optional base64
}

export async function createEmployee(data: CreateEmployeeInput): Promise<EmployeeDTO> {
  // Try signed URL workflow first (if backend supports it)
  if (data.photoDataUrl && isBackendConfigured()) {
    try {
      const filename = `${data.employee_id}.jpg`;
      const signResp = await http<{ upload_url: string; public_url: string }>(`/uploads/sign?type=employee-photo&filename=${encodeURIComponent(filename)}`);
      if (signResp?.upload_url) {
        const file = base64ToFile(data.photoDataUrl, filename);
        const putRes = await fetch(signResp.upload_url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
        if (!putRes.ok) throw new Error('Upload failed');
        // Now create employee referencing public URL
        return http<EmployeeDTO>('/employees', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_id: data.employee_id,
            full_name: data.full_name,
            department: data.department,
            position: data.position,
            email: data.email,
            phone: data.phone,
            photo_url: signResp.public_url
          })
        });
      }
    } catch (e) {
      // Fall back silently to multipart path
      // eslint-disable-next-line no-console
      console.warn('[employees] signed upload path failed, falling back', e);
    }
  }

  // Fallback to multipart form
  const form = new FormData();
  form.append('employee_id', data.employee_id);
  form.append('full_name', data.full_name);
  if (data.department) form.append('department', data.department);
  if (data.position) form.append('position', data.position);
  if (data.email) form.append('email', data.email);
  if (data.phone) form.append('phone', data.phone);
  if (data.photoDataUrl) {
    const file = base64ToFile(data.photoDataUrl, `${data.employee_id}.jpg`);
    form.append('photo', file);
  }
  return http<EmployeeDTO>('/employees', { method: 'POST', body: form, headers: {} });
}

export interface UpdateEmployeeInput {
  full_name?: string;
  department?: string;
  position?: string;
  email?: string;
  phone?: string;
  status?: string;
  photo_url?: string | null;
}

export async function updateEmployee(employee_id: string, updates: UpdateEmployeeInput): Promise<EmployeeDTO | null> {
  try {
    return await http<EmployeeDTO>(`/employees/${encodeURIComponent(employee_id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
  } catch {
    return null;
  }
}

export async function deleteEmployee(employee_id: string): Promise<boolean> {
  try {
    const res = await http<{ deleted: boolean }>(`/employees/${encodeURIComponent(employee_id)}`, { method: 'DELETE' });
    return !!res?.deleted;
  } catch {
    return false;
  }
}

export async function encodeEmployee(employee_id: string): Promise<{ queued: boolean } | null> {
  try {
    return await http<{ queued: boolean }>(`/employees/${encodeURIComponent(employee_id)}/encode`, { method: 'POST' });
  } catch {
    return null;
  }
}

export interface BulkImportResult {
  imported: number;
  skipped: number;
  errors?: Array<{ line: number; message: string }>; // depends on backend
}

export async function bulkImportEmployees(file: File): Promise<BulkImportResult> {
  const form = new FormData();
  form.append('file', file);
  return http<BulkImportResult>('/employees/bulk', {
    method: 'POST',
    body: form,
    headers: {}
  });
}
