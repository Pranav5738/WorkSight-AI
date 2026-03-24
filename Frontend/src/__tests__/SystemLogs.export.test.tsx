import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SystemLogs } from '../pages/SystemLogs';

vi.mock('../lib/api/http', () => ({ isBackendConfigured: () => true }));

const logs = [
  { id: '1', created_at: new Date().toISOString(), event_type: 'system', description: 'Startup complete' },
  { id: '2', created_at: new Date().toISOString(), event_type: 'attendance', description: 'Alice present' }
];

const fetchLogsMock = vi.fn().mockResolvedValue(logs);
vi.mock('../lib/api/logs', () => ({ fetchLogs: () => fetchLogsMock() }));

vi.mock('../lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ order: () => ({}) }) }) }
}));

describe('SystemLogs export', () => {
  it('creates a downloadable CSV when export clicked', async () => {
    const createElSpy = vi.spyOn(document, 'createElement');
    if (!(URL as any).createObjectURL) {
      (URL as any).createObjectURL = () => 'blob:mock';
    }
    if (!(URL as any).revokeObjectURL) {
      (URL as any).revokeObjectURL = () => {};
    }
    const objectUrlSpy = vi.spyOn(URL, 'createObjectURL');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');

    render(<SystemLogs />);
    await waitFor(() => expect(fetchLogsMock).toHaveBeenCalled());

    const exportBtn = screen.getByRole('button', { name: /Export Logs/i });
    fireEvent.click(exportBtn);

    expect(createElSpy).toHaveBeenCalledWith('a');
    expect(objectUrlSpy).toHaveBeenCalled();
    expect(revokeSpy).toHaveBeenCalled();
  });
});
