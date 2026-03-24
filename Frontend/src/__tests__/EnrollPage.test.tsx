import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { EnrollPage } from '../pages/Enroll';
import { vi } from 'vitest';

// Minimal mock for supabase to avoid runtime errors in test environment
vi.mock('../lib/supabase', () => ({
  supabase: { from: () => ({ insert: () => ({ select: () => ({ single: () => ({}) }) }) }) }
}));

vi.mock('../lib/api/http', () => ({
  isBackendConfigured: () => false
}));

vi.mock('../lib/api/employees', () => ({
  createEmployee: vi.fn(),
  bulkImportEmployees: vi.fn()
}));

describe('EnrollPage', () => {
  it('renders form fields', () => {
    const { getByText } = render(<EnrollPage />);
    expect(getByText(/Enroll/i)).toBeTruthy();
  });
});
