import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EnrollPage } from '../pages/Enroll';

// Disable backend so Supabase path is used
vi.mock('../lib/api/http', () => ({ isBackendConfigured: () => false }));

// Supabase mock to handle bulk insert
// (Optional) Could spy on insert if we exposed it; currently not needed.
vi.mock('../lib/supabase', () => ({
  supabase: { from: () => ({ insert: () => ({ select: () => ({}) }) }) }
}));

vi.mock('../lib/api/employees', () => ({ createEmployee: vi.fn(), bulkImportEmployees: vi.fn() }));

// Mock FileReader
class FileReaderMock {
  result: string | ArrayBuffer | null = null;
  onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;
  readAsText() {
    this.result = 'E10,Jane Doe,Engineering,Developer,jane@example.com,5551234';
    const evt = { target: { result: this.result } } as ProgressEvent<FileReader>;
    // @ts-expect-error simplified mock
    this.onload && this.onload(evt);
  }
}
// @ts-expect-error assign mock
global.FileReader = FileReaderMock;

describe('EnrollPage bulk import success', () => {
  it('parses CSV and shows success message after import', async () => {
    render(<EnrollPage />);
    fireEvent.click(screen.getByRole('button', { name: /Bulk Import/i }));
  screen.getByRole('button', { name: /Choose File/i });

    // Access hidden input via query (we rely on it appearing after clicking Choose File button by triggering its handler directly)
    const file = new File(['dummy'], 'employees.csv', { type: 'text/csv' });
    // Manually trigger input change via dispatching on the input element
    const input = document.querySelector('input[type="file"][accept=".csv,text/csv"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByText(/Loaded 1 rows/i)).toBeTruthy();
    }, { timeout: 500 });

  const importButtons = screen.getAllByRole('button', { name: /^Import$/i });
  fireEvent.click(importButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Successfully imported 1 employees/i)).toBeTruthy();
    });
  });
});
