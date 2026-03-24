import { http, isBackendConfigured } from './http';

export interface EmailSettings {
  alert_email: string;
  updated_at?: string;
  enabled: boolean;
  alert_cooldown_seconds: number;
  alert_bypass_levels: string[];
}

export interface EmailSettingsUpdatePayload {
  alert_email?: string;
  alert_cooldown_seconds?: number;
  alert_bypass_levels?: string[];
}

export async function fetchEmailSettings(): Promise<EmailSettings | null> {
  if (!isBackendConfigured()) return null;
  try { return await http<EmailSettings>('/settings/email'); } catch { return null; }
}

export async function updateEmailSettings(alert_email: string): Promise<EmailSettings | null> {
  return updateSettings({ alert_email });
}

export async function updateSettings(payload: EmailSettingsUpdatePayload): Promise<EmailSettings | null> {
  if (!isBackendConfigured()) return null;
  try {
    return await http<EmailSettings>('/settings/email', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch { return null; }
}

export async function sendTestAlert(): Promise<boolean> {
  if (!isBackendConfigured()) return false;
  try {
    await http('/settings/email/test', { method: 'POST' });
    return true;
  } catch { return false; }
}

export interface EmailStatus {
  alert_email: string;
  cooldown_seconds: number;
  bypass_levels: string[];
  last_alert_sent_at: string | null;
  server_time: string;
  next_allowed_at: string | null;
  seconds_until_next: number;
}

export async function fetchEmailStatus(): Promise<EmailStatus | null> {
  if (!isBackendConfigured()) return null;
  try {
    return await http<EmailStatus>('/settings/email/status');
  } catch { return null; }
}

// App Preferences (user-facing application preferences)
export interface AppPreferences {
  confidence_threshold: number; // 0-1
  camera_assignments: Record<string, string>;
  // intruder notification flags removed
}

export interface AppPreferencesUpdate {
  confidence_threshold?: number;
  camera_assignments?: Record<string, string>;
  // intruder notification flags removed
}

export async function fetchAppPreferences(): Promise<AppPreferences | null> {
  if (!isBackendConfigured()) return null;
  try { return await http<AppPreferences>('/settings/app'); } catch { return null; }
}

export async function updateAppPreferences(payload: AppPreferencesUpdate): Promise<AppPreferences | null> {
  if (!isBackendConfigured()) return null;
  try {
    return await http<AppPreferences>('/settings/app', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch { return null; }
}
