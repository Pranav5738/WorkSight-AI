import { http, isBackendConfigured } from './http';

export interface AttendanceRecordDTO {
  id?: string;
  employee_id: string;
  date: string;
  check_in_time?: string | null;
  check_out_time?: string | null;
  status: string;
  marked_by?: string;
  created_at?: string;
}

export interface EmployeeAttendanceDTO {
  id: string;
  employee_id: string;
  full_name: string;
  department?: string | null;
  position?: string | null;
  email?: string | null;
  phone?: string | null;
  photo_url?: string | null;
  status?: string;
  attendance?: AttendanceRecordDTO | null;
}

// Shape expected from backend consolidated endpoint (optional)
interface AttendanceTodayResponse {
  employees: EmployeeAttendanceDTO[];
  records?: AttendanceRecordDTO[];
  stats?: { present: number; absent: number; late: number };
}

export async function fetchTodayAttendance(): Promise<AttendanceTodayResponse | null> {
  if (!isBackendConfigured()) return null;
  try {
    return await http<AttendanceTodayResponse>('/attendance/today');
  } catch (e) {
    console.warn('[attendance] backend fetch failed, falling back to Supabase path', e);
    return null;
  }
}

export interface MarkAttendanceInput {
  employee_id: string;
  status?: string; // present | late | on_leave
  method?: 'ai' | 'manual';
}

export async function markAttendanceBackend(input: MarkAttendanceInput): Promise<AttendanceRecordDTO | null> {
  if (!isBackendConfigured()) return null;
  try {
    return await http<AttendanceRecordDTO>('/attendance/mark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
  } catch (e) {
    console.warn('[attendance] mark backend failed', e);
    return null;
  }
}

export async function checkoutAttendance(employee_id: string): Promise<AttendanceRecordDTO | null> {
  if (!isBackendConfigured()) return null;
  try {
    return await http<AttendanceRecordDTO>('/attendance/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id })
    });
  } catch (e) {
    console.warn('[attendance] checkout failed', e);
    return null;
  }
}

export async function updateAttendanceStatus(recordId: string, status: string): Promise<AttendanceRecordDTO | null> {
  if (!isBackendConfigured()) return null;
  try {
    return await http<AttendanceRecordDTO>(`/attendance/${recordId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
  } catch (e) {
    console.warn('[attendance] update status failed', e);
    return null;
  }
}

export async function deleteAttendanceRecord(recordId: string): Promise<boolean> {
  if (!isBackendConfigured()) return false;
  try {
    const res = await http<{ deleted: boolean }>(`/attendance/${recordId}`, { method: 'DELETE' });
    return !!res?.deleted;
  } catch (e) {
    console.warn('[attendance] delete failed', e);
    return false;
  }
}

export interface AttendanceSearchResponse {
  items: AttendanceRecordDTO[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export async function searchAttendance(params: { page?: number; page_size?: number; employee_id?: string; date_from?: string; date_to?: string; order?: 'asc'|'desc' }): Promise<AttendanceSearchResponse | null> {
  if (!isBackendConfigured()) return null;
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.page_size) qs.set('page_size', String(params.page_size));
  if (params.employee_id) qs.set('employee_id', params.employee_id);
  if (params.date_from) qs.set('date_from', params.date_from);
  if (params.date_to) qs.set('date_to', params.date_to);
  if (params.order) qs.set('order', params.order);
  try {
    return await http<AttendanceSearchResponse>(`/attendance/search?${qs.toString()}`);
  } catch (e) {
    console.warn('[attendance] search failed', e);
    return null;
  }
}
