import { http } from './http';

export interface MeResponse { username: string; roles?: string[] }

export async function fetchMe(): Promise<MeResponse | null> {
  try {
    return await http<MeResponse>('/auth/me');
  } catch {
    return null;
  }
}
