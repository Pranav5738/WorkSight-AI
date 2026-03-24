import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { AttendanceSystem } from '../pages/AttendanceSystem';

// Mock backend configured
vi.mock('../lib/api/http', () => ({
  isBackendConfigured: () => true
}));

// Provide a stable backend attendance response
const mockFetchToday = vi.fn().mockResolvedValue({
  employees: [
    { id: '1', employee_id: 'E1', full_name: 'Alice', department: 'Eng', attendance: { status: 'present', check_in_time: new Date().toISOString() } },
    { id: '2', employee_id: 'E2', full_name: 'Bob', department: 'Ops', attendance: null },
    { id: '3', employee_id: 'E3', full_name: 'Charlie', department: 'HR', attendance: { status: 'late', check_in_time: new Date().toISOString() } },
    { id: '4', employee_id: 'E4', full_name: 'Dana', department: 'Fin', attendance: null }
  ]
});

vi.mock('../lib/api/attendance', () => ({
  fetchTodayAttendance: () => mockFetchToday(),
  markAttendanceBackend: vi.fn()
}));

// Avoid actual recognition path
vi.mock('../lib/gemini', () => ({
  recognizeFace: () => Promise.resolve({ identified: false, confidence: 0 })
}));

// Supabase mock fallback (should not be called in this test, but keep minimal shape)
vi.mock('../lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({}) }), insert: () => ({ select: () => ({ single: () => ({}) }) }) }) }
}));

describe('AttendanceSystem filters (backend mode)', () => {
  it('renders stats and filters employee list correctly', async () => {
    render(<AttendanceSystem />);

    // Wait for backend data load by asserting counts
    await waitFor(() => {
      expect(screen.getByTestId('stat-present-count').textContent).toBe('1');
      expect(screen.getByTestId('stat-absent-count').textContent).toBe('2');
      expect(screen.getByTestId('stat-late-count').textContent).toBe('1');
    });

    // Filter: Present
    fireEvent.click(screen.getByRole('button', { name: /Present/i }));
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.queryByText('Bob')).toBeNull();
    expect(screen.queryByText('Charlie')).toBeNull();

    // Filter: Late
    fireEvent.click(screen.getByRole('button', { name: /Late/i }));
    expect(screen.getByText('Charlie')).toBeTruthy();
    expect(screen.queryByText('Alice')).toBeNull();

    // Filter: Absent
    fireEvent.click(screen.getByRole('button', { name: /Absent/i }));
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText('Dana')).toBeTruthy();
  });
});
