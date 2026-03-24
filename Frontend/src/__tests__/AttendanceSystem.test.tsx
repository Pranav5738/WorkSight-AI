import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AttendanceSystem } from '../pages/AttendanceSystem';
import { vi } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({}) }) }),
      insert: () => ({ select: () => ({ single: () => ({}) }) })
    })
  }
}));

vi.mock('../lib/api/http', () => ({
  isBackendConfigured: () => false
}));

vi.mock('../lib/api/attendance', () => ({
  fetchTodayAttendance: () => Promise.resolve(null),
  markAttendanceBackend: () => Promise.resolve(null)
}));

vi.mock('../lib/gemini', () => ({
  recognizeFace: () => Promise.resolve({ identified: false, confidence: 0 })
}));

describe('AttendanceSystem', () => {
  it('renders header and recognition mode badge', () => {
    const { getByText, getByTestId } = render(<AttendanceSystem />);
    expect(getByText(/AI Attendance System/i)).toBeTruthy();
    const badge = getByTestId('recognition-mode-badge');
    expect(badge.textContent).toMatch(/(Simulation|Gemini)/i);
  });
});
