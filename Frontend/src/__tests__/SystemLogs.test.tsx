import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { SystemLogs } from '../pages/SystemLogs';

// Backend enabled
vi.mock('../lib/api/http', () => ({
  isBackendConfigured: () => true
}));

const allLogs = [
  { id: '1', created_at: new Date().toISOString(), event_type: 'attendance', description: 'Marked present' },
  { id: '2', created_at: new Date().toISOString(), event_type: 'security', description: 'Security event detected' },
  { id: '3', created_at: new Date().toISOString(), event_type: 'system', description: 'Bulk import done' }
];

const fetchLogsMock = vi.fn((filter?: string) => {
  if (!filter || filter === 'all') return Promise.resolve(allLogs);
  return Promise.resolve(allLogs.filter(l => l.event_type === filter));
});

vi.mock('../lib/api/logs', () => ({
  fetchLogs: (filter?: string) => fetchLogsMock(filter)
}));

// Supabase fallback (unused here)
vi.mock('../lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ order: () => ({}) }) }) }
}));

describe('SystemLogs filtering (backend mode)', () => {
  it('filters by security logs', async () => {
    render(<SystemLogs />);

    // Wait initial load (all)
    await waitFor(() => expect(fetchLogsMock).toHaveBeenCalledWith('all'));
  expect(screen.getByText(/Security event detected/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Security/i }));
    await waitFor(() => expect(fetchLogsMock).toHaveBeenCalledWith('security'));

    // Now only security log should appear
  expect(screen.getByText(/Security event detected/i)).toBeTruthy();
    expect(screen.queryByText(/Bulk import done/i)).toBeNull();
    expect(screen.queryByText(/Marked present/i)).toBeNull();
  });
});
