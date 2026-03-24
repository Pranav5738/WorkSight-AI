import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { EnrollPage } from '../pages/Enroll';

vi.mock('../lib/api/http', () => ({
  isBackendConfigured: () => false // force Supabase path to avoid backend specifics here
}));

vi.mock('../lib/api/employees', () => ({
  createEmployee: vi.fn(),
  bulkImportEmployees: vi.fn()
}));

vi.mock('../lib/supabase', () => ({
  supabase: { from: () => ({ insert: () => ({ select: () => ({ single: () => ({}) }) }) }) }
}));

describe('EnrollPage bulk mode UI', () => {
  it('switches to bulk import view', () => {
    render(<EnrollPage />);
    fireEvent.click(screen.getByRole('button', { name: /Bulk Import/i }));
    expect(screen.getByText(/Bulk Import \(CSV\)/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Choose File/i })).toBeTruthy();
  });
});
