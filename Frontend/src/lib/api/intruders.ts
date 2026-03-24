// Intruder API removed. This stub remains to avoid breaking any stray imports.

export interface IntruderDTO {
  id?: string;
  timestamp: string;
  location: string;
  threat_level: 'low' | 'medium' | 'high' | 'critical';
  description?: string;
  resolved?: boolean;
}

export interface IntruderListResponse {
  items: IntruderDTO[];
  total: number;
  has_more: boolean;
}

export interface IntruderQuery {
  page?: number;
  page_size?: number;
  search?: string;
  threat_level?: string;
  order?: 'asc' | 'desc';
  sort_by?: 'timestamp' | 'threat_level' | 'resolved';
}

export async function fetchIntruders(): Promise<IntruderDTO[] | null> {
  return null;
}

export async function fetchIntrudersPaged(_q: IntruderQuery = {}): Promise<IntruderListResponse | null> {
  return null;
}

export interface ReportIntruderInput {
  location: string;
  threat_level: 'low' | 'medium' | 'high' | 'critical';
  description?: string;
  snapshotDataUrl?: string;
}

export async function reportIntruderBackend(_input: ReportIntruderInput): Promise<IntruderDTO | null> {
  return null;
}

export async function resolveIntruder(_id: string): Promise<IntruderDTO | null> {
  return null;
}

export async function deleteIntruder(_id: string): Promise<boolean> {
  return false;
}

export async function updateIntruder(_id: string, _body: Partial<IntruderDTO>): Promise<IntruderDTO | null> {
  return null;
}
