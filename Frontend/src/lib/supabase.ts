import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

// Gracefully handle missing env vars so local dev without Supabase still works.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

export const supabaseAvailable = !!supabaseUrl && !!supabaseKey;

function buildStub() {
  // Lightweight in-memory mock data for dev preview
  const employees = [
    { id: 'emp_1', employee_id: 'E001', full_name: 'Demo Employee 1', department: 'Engineering', status: 'active', photo_url: '' },
    { id: 'emp_2', employee_id: 'E002', full_name: 'Demo Employee 2', department: 'Operations', status: 'active', photo_url: '' }
  ];

  const wrapResult = (data: any) => ({ data, error: null });
  const errorResult = () => ({ data: null, error: new Error('Supabase not configured') });

  const thenable = (payload: any) => {
    return Object.assign({}, payload, {
      then: (resolve: any) => Promise.resolve(payload).then(resolve),
      catch: () => Promise.resolve(payload)
    });
  };

  const makeQuery = (table?: string, current: any = {}): any => {
    const api: any = {
      select: () => makeQuery(table, { action: 'select', data: table === 'employees' ? employees : [] }),
      insert: (rows: any) => makeQuery(table, { action: 'insert', data: wrapResult(rows) }),
      update: () => makeQuery(table, { action: 'update', data: errorResult() }),
      upsert: () => makeQuery(table, { action: 'upsert', data: errorResult() }),
      delete: () => makeQuery(table, { action: 'delete', data: errorResult() }),
      eq: () => makeQuery(table, current),
      single: () => Promise.resolve(errorResult())
    };
    // When awaited after a select chain, return shape similar to real client
    if (current.action === 'select') {
      return thenable({ data: current.data, error: null });
    }
    return api;
  };

  return {
    from: (table: string) => makeQuery(table),
    auth: {
      getSession: async () => ({ data: { session: null }, error: new Error('Supabase not configured') })
    }
  } as any;
}

export const supabase = (supabaseAvailable && supabaseUrl && supabaseKey)
  ? createClient<Database>(supabaseUrl, supabaseKey)
  : buildStub();

if (!supabaseAvailable && import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.warn('[supabase] Environment variables missing. Operating in fallback mode.');
}
