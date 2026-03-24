import { http, isBackendConfigured } from './http';
import { recognizeFace } from '../gemini';

export interface IdentifyResult {
  identified: boolean;
  employeeId?: string;
  confidence: number; // 0-1
  method?: string; // embedding | simulated | model name
}

interface BackendIdentifyResponse {
  identified: boolean;
  employee_id?: string;
  confidence?: number;
  method?: string;
}

// Attempts backend recognition first (if configured), then gemini.ts, then simulation.
export async function identifyFace(
  imageData: string,
  roster: Array<{id: string; full_name: string; photo_url?: string | null}>,
  threshold?: number
): Promise<IdentifyResult> {
  if (isBackendConfigured()) {
    try {
      const res = await http<BackendIdentifyResponse>('/recognition/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: imageData,
          roster: roster.map(r => ({ id: r.id, name: r.full_name, photo_url: r.photo_url })),
          threshold
        })
      });
      if (res) {
        return {
          identified: !!res.identified && !!res.employee_id,
          employeeId: res.employee_id,
          confidence: res.confidence ?? 0,
          method: res.method
        };
      }
    } catch (e) {
      console.warn('[recognition] backend identify failed, falling back', e);
    }
  }
  // Fallback to existing Gemini flow (which itself may simulate)
  try {
    const gemini = await recognizeFace(imageData, roster);
  return { identified: gemini.identified && !!gemini.employeeId, employeeId: gemini.employeeId, confidence: gemini.confidence, method: gemini.method };
  } catch (e) {
    console.warn('[recognition] gemini fallback failed, returning simulation false', e);
  }
  return { identified: false, confidence: 0, method: 'none' };
}
