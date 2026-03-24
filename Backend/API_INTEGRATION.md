# Google Gemini AI Integration Guide

This guide explains how to integrate Google's Gemini AI for real facial recognition in the attendance system.

## Current Implementation

The application currently uses **simulated facial recognition** that randomly marks attendance for demonstration purposes. This works perfectly for testing and demos without requiring any API keys.

## Enabling Real Facial Recognition

To enable actual AI-powered facial recognition using Google's Gemini API:

### Step 1: Get Google Gemini API Key

1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the generated API key

### Step 2: Configure Environment

Add your API key to the `.env` file:

```env
VITE_GEMINI_API_KEY=your_actual_api_key_here
```

**Security Note**: Never commit API keys to version control. The `.env` file is already in `.gitignore`.

### Step 3: Install Required Package

```bash
npm install @google/generative-ai
```

### Step 4: Implementation

#### A. Create Gemini Service

Create a new file `src/lib/gemini.ts`:

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

if (!apiKey) {
  console.warn('Gemini API key not configured. Using simulation mode.');
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export interface FaceRecognitionResult {
  identified: boolean;
  employeeId?: string;
  confidence: number;
}

export async function recognizeFace(
  imageData: string,
  employeePhotos: Array<{ id: string; photo_url: string; full_name: string }>
): Promise<FaceRecognitionResult> {
  if (!genAI) {
    throw new Error('Gemini API not configured');
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
      Analyze this image and identify if the person matches any of these employee photos.
      Return a JSON response with:
      { "identified": boolean, "employeeId": string or null, "confidence": number }

      Employee database:
      ${employeePhotos.map(e => `ID: ${e.id}, Name: ${e.full_name}, Photo: ${e.photo_url}`).join('\n')}
    `;

    const imagePart = {
      inlineData: {
        data: imageData.split(',')[1],
        mimeType: 'image/jpeg'
      }
    };

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    const parsed = JSON.parse(text);

    return {
      identified: parsed.identified,
      employeeId: parsed.employeeId,
      confidence: parsed.confidence
    };
  } catch (error) {
    console.error('Face recognition error:', error);
    return { identified: false, confidence: 0 };
  }
}
```

#### B. Update AttendanceSystem Component

Modify `src/pages/AttendanceSystem.tsx`:

```typescript
import { recognizeFace } from '../lib/gemini';

// Inside AttendanceSystem component:

const handleFrameCapture = async (imageData: string) => {
  if (scanning) return;
  setScanning(true);

  try {
    // Prepare employee data for recognition
    const employeeData = employees.map(emp => ({
      id: emp.id,
      photo_url: emp.photo_url || '',
      full_name: emp.full_name
    }));

    // Call Gemini API for face recognition
    const result = await recognizeFace(imageData, employeeData);

    if (result.identified && result.employeeId) {
      const employee = employees.find(e => e.id === result.employeeId);

      if (employee && !employee.attendance) {
        await markAttendance(employee);
        setToast({
          message: `${employee.full_name} recognized with ${(result.confidence * 100).toFixed(0)}% confidence`,
          type: 'success'
        });
      }
    }
  } catch (error) {
    console.error('Recognition error:', error);
    setToast({
      message: 'Face recognition failed. Check API configuration.',
      type: 'error'
    });
  } finally {
    setScanning(false);
  }
};
```

### Step 5: Fallback Strategy

Implement graceful fallback when API is not configured:

```typescript
const handleFrameCapture = async (imageData: string) => {
  if (scanning) return;
  setScanning(true);

  try {
    // Check if Gemini API is configured
    if (import.meta.env.VITE_GEMINI_API_KEY) {
      // Use real AI recognition
      const result = await recognizeFace(imageData, employeeData);
      // ... handle result
    } else {
      // Fallback to simulation (current implementation)
      const absentEmployees = employees.filter(emp => !emp.attendance);
      if (absentEmployees.length > 0) {
        const randomEmployee = absentEmployees[Math.floor(Math.random() * absentEmployees.length)];
        await markAttendance(randomEmployee);
      }
    }
  } catch (error) {
    console.error('Recognition error:', error);
  } finally {
    setScanning(false);
  }
};
```

## Alternative: OpenAI Vision API

If you prefer OpenAI's API:

### Install Package
```bash
npm install openai
```

### Implementation

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true // Only for client-side
});

export async function recognizeFaceOpenAI(
  imageData: string,
  employeePhotos: Array<{ id: string; photo_url: string; full_name: string }>
): Promise<FaceRecognitionResult> {
  const response = await openai.chat.completions.create({
    model: "gpt-4-vision-preview",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Identify if the person in this image matches any of these employees:\n${employeePhotos.map(e => `${e.full_name} (ID: ${e.id})`).join('\n')}\nRespond with JSON: { "identified": boolean, "employeeId": string, "confidence": number }`
          },
          {
            type: "image_url",
            image_url: {
              url: imageData
            }
          }
        ]
      }
    ],
    max_tokens: 300
  });

  const result = JSON.parse(response.choices[0].message.content || '{}');
  return result;
}
```

## Security Best Practices

1. **Never commit API keys**
   - Keep `.env` file in `.gitignore`
   - Use environment variables in production

2. **Server-side processing (Recommended)**
   - Create a Supabase Edge Function for face recognition
   - Keep API keys on the server
   - Example:

```typescript
// supabase/functions/recognize-face/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { GoogleGenerativeAI } from 'npm:@google/generative-ai';

serve(async (req) => {
  const { imageData, employees } = await req.json();

  const genAI = new GoogleGenerativeAI(Deno.env.get('GEMINI_API_KEY')!);
  // ... recognition logic

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' }
  });
});
```

3. **Rate limiting**
   - Implement rate limiting for API calls
   - Cache results when appropriate
   - Use debouncing for camera captures

4. **Error handling**
   - Always have fallback mechanisms
   - Log errors appropriately
   - Provide clear user feedback

## Cost Considerations

### Google Gemini Pricing (as of 2024)
- Gemini 1.5 Flash: Free tier available
- ~$0.00001 per image with free tier limits
- Monitor usage in Google Cloud Console

### OpenAI Vision Pricing
- GPT-4 Vision: ~$0.01-0.03 per image
- Can get expensive with frequent captures
- Consider reducing capture frequency

### Optimization Tips
1. Reduce capture frequency (10-15 seconds instead of 5)
2. Only capture when faces are detected
3. Cache recognized faces temporarily
4. Use lower resolution images
5. Batch process during off-peak hours

## Testing

Test your integration:

```typescript
// Test script
const testImage = 'data:image/jpeg;base64,...';
const testEmployees = [/* sample employees */];

recognizeFace(testImage, testEmployees)
  .then(result => console.log('Recognition result:', result))
  .catch(error => console.error('Test failed:', error));
```

## Troubleshooting

### API Key Issues
- Verify key is correct in `.env`
- Check if key is active in Google AI Studio
- Ensure proper environment variable naming

### Low Accuracy
- Use high-quality employee photos
- Ensure good lighting in camera feed
- Increase confidence threshold
- Fine-tune prompt engineering

### Performance Issues
- Reduce image resolution before sending
- Implement request caching
- Use Edge Functions for server-side processing
- Optimize capture frequency

## Production Deployment

For production:

1. Use Edge Functions (recommended)
2. Set environment variables in hosting platform
3. Enable HTTPS (required for camera access)
4. Implement proper error tracking
5. Add analytics for monitoring

## Support

For Gemini API support:
- [Google AI Documentation](https://ai.google.dev/docs)
- [API Reference](https://ai.google.dev/api)

For OpenAI Vision support:
- [OpenAI Vision Guide](https://platform.openai.com/docs/guides/vision)
