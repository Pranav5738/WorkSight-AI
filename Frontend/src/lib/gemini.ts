import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

let client: GoogleGenerativeAI | null = null;
if (apiKey) {
  try {
    client = new GoogleGenerativeAI(apiKey);
  } catch (e) {
    console.warn('[gemini] initialization failed', e);
  }
}

export interface FaceRecognitionResult {
  identified: boolean;
  employeeId?: string;
  confidence: number; // 0..1
  raw?: any;
  method?: string;
}

export async function recognizeFace(
  imageDataUrl: string,
  employees: Array<{ id: string; full_name: string; photo_url?: string | null }>
): Promise<FaceRecognitionResult> {
  if (!client) {
    // simulation fallback: randomly succeed with low confidence
    const pick = Math.random() > 0.7 && employees.length > 0 ? employees[Math.floor(Math.random() * employees.length)] : null;
    return {
      identified: !!pick,
      employeeId: pick?.id,
      confidence: pick ? 0.4 + Math.random() * 0.4 : 0,
      method: 'gemini-sim'
    };
  }
  try {
    const model = client.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `You are a face matching assistant. Given an input image and a roster, respond ONLY with JSON {"identified":bool,"employeeId":string|null,"confidence":number}`;
    const inlineData = {
      inlineData: {
        data: imageDataUrl.split(',')[1],
        mimeType: 'image/jpeg'
      }
    } as const;
    const roster = employees.map(e => `${e.id}: ${e.full_name}`).join('\n');
    const result = await model.generateContent([
      { text: prompt + '\nRoster:\n' + roster },
      inlineData
    ] as any);
    const response = await result.response;
    const text = response.text();
    const parsed = JSON.parse(text);
    return {
      identified: !!parsed.identified,
      employeeId: parsed.employeeId || undefined,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      raw: parsed,
      method: 'gemini'
    };
  } catch (e) {
    console.warn('[gemini] recognition failed, using simulation', e);
  return { identified: false, confidence: 0, method: 'gemini-error' };
  }
}
