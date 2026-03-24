import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { act } from 'react-dom/test-utils';
import { AttendanceSystem } from '../pages/AttendanceSystem';

// Mock CameraView to immediately emit a frame once
vi.mock('../components/CameraView', () => ({
  CameraView: (props: any) => {
    return (
      <button
        data-testid="camera-view-mock"
        onClick={() => props.onFrame && props.onFrame('data:image/png;base64,TEST')}
      >Trigger Frame</button>
    );
  }
}));

// Backend configured, provide minimal http mock used by recognition identify path
vi.mock('../lib/api/http', () => ({
  isBackendConfigured: () => true,
  http: () => Promise.reject(new Error('forced http mock reject')) // force fallback path predictably
}));

const employeesPayload = {
  employees: [
    { id: '1', employee_id: 'E1', full_name: 'Alice', department: 'Eng', attendance: { status: 'present', check_in_time: new Date().toISOString() } },
    { id: '2', employee_id: 'E2', full_name: 'Bob', department: 'Ops', attendance: null }
  ]
};

const fetchTodayAttendanceMock = vi.fn().mockResolvedValue(employeesPayload);
const markAttendanceBackendMock = vi.fn().mockResolvedValue({ id: 'rec1', employee_id: 'E2', status: 'present' });

vi.mock('../lib/api/attendance', () => ({
  fetchTodayAttendance: () => fetchTodayAttendanceMock(),
  markAttendanceBackend: (input: any) => markAttendanceBackendMock(input)
}));

// Force recognition simulation (no Gemini key) but deterministic choice via Math.random
vi.spyOn(Math, 'random').mockReturnValue(0); // Always pick first absent employee

// Stub Supabase fallback (should not be used for insert if backend works)
vi.mock('../lib/supabase', () => ({
  supabase: { from: () => ({ insert: () => ({ select: () => ({ single: () => ({}) }) }), select: () => ({ eq: () => ({}) }) }) }
}));

// Mock Gemini recognition to positively identify Bob (E2)
vi.mock('../lib/gemini', () => ({ recognizeFace: () => Promise.resolve({ identified: true, employeeId: 'E2', confidence: 0.82, method: 'test' }) }));

describe('AttendanceSystem mark attendance (backend)', () => {
  it('calls backend markAttendanceBackend for an absent employee', async () => {
    const { getByTestId, findByText } = render(<AttendanceSystem />);
    // Ensure employees loaded
    await findByText('Bob');
  // Trigger frame explicitly
  act(() => { getByTestId('camera-view-mock').click(); });
    await waitFor(() => expect(markAttendanceBackendMock).toHaveBeenCalled());
    const args = markAttendanceBackendMock.mock.calls[0][0];
    expect(args.employee_id).toBe('E2');
    expect(args.status).toBe('present');
  });
});
