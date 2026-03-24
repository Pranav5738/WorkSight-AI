<<<<<<< HEAD
# CONTEXA_VISION
CONTEXA VISION is a full-stack AI-powered attendance and monitoring system using face recognition to automate workforce management. Built with React, FastAPI, and computer vision, it features real-time attendance, employee tracking, alerts, and a fallback system for reliability in real-world use.
=======
# CONTEXA VISION - Security & Attendance Management System

> Supports dual data layer: direct Supabase mode (default) OR external backend API (FastAPI, etc.) when `VITE_API_URL` is configured. The UI shows a badge indicating the active mode.

A comprehensive, production-ready web application for security monitoring and AI-powered attendance tracking built with React, TypeScript, Tailwind CSS, and Supabase.

## Features

### Authentication
- Secure login system with demo credentials
- Session persistence with localStorage
- Protected routes and role-based access control

### Dashboard
- Real-time metrics and KPIs
- Quick action navigation cards
- Recent activity feed
- System status indicators



### AI Attendance System
- Live camera feed with automatic face detection
- Employee database with photo management
- Automated attendance marking
- Status tracking (Present, Absent, Late, On Leave)
- Manual override capabilities
- Sortable and filterable employee list
- Export attendance reports

### System Logs
- Fully responsive design (mobile, tablet, desktop)
- Smooth animations and transitions
## Tech Stack


## Demo Credentials
## Setup Instructions

   ```
   This runs both the frontend and backend concurrently.

3. PowerShell wrapper (delegates to the same Node launcher – minimal, no background jobs):
   (Internally executes: `node scripts/dev.js` with matching flags.)

Environment variable `VITE_API_URL` (e.g. `http://127.0.0.1:8000`) enables backend-first mode; otherwise Supabase fallback logic is used.

### Prerequisites

- Node.js 18+ and npm
- Supabase account (database already configured)

### Installation

1. **Clone and install dependencies:**

```bash
npm install
```

2. **Environment Variables:**

The `.env` file is already configured with Supabase credentials:

```env
VITE_SUPABASE_URL=https://kwdtlfxhxqmwmmcvvuqg.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

3. **Database Setup:**

The database schema has been automatically created with the following tables:
- `profiles` - User profiles
- `employees` - Employee records (10 sample employees included)
- `attendance_records` - Daily attendance tracking
- `system_logs` - System activity logs
### Development

Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

## Backend API Integration (Optional)

You can plug in a custom backend (e.g., FastAPI) to handle business logic, face recognition, and data persistence. When `VITE_API_URL` is set:

- Employee enrollment uses multipart POST `/employees`
- Bulk employee import uses POST `/employees/bulk` with CSV
- Attendance page tries GET `/attendance/today` and POST `/attendance/mark`
- System logs page tries GET `/logs` (optional `?type=attendance|security|...`)
- Fallback: If any backend request fails, the app transparently falls back to Supabase operations
- Mode indicator badge (BACKEND or SUPABASE) appears in the header

### Endpoints Expected
| Purpose | Method | Path | Notes |
|---------|--------|------|-------|
| List employees (optional) | GET | /employees | Used by future features (not yet wired for listing) |
| Create employee | POST | /employees | multipart/form-data (fields + optional `photo`) |
| Bulk import | POST | /employees/bulk | multipart/form-data (`file` CSV) -> returns `{ imported, skipped }` |
| Attendance snapshot | GET | /attendance/today | Returns merged employees with today records |
| Mark attendance | POST | /attendance/mark | JSON: `{ employee_id, status, method }` |
 
| Logs | GET | /logs | Optional query param `?type=` filters logs |

### Environment Setup

Copy `.env.example` to `.env` and fill values:
```bash
cp .env.example .env
```

Minimum required for Supabase mode:
```env
VITE_SUPABASE_URL=... 
VITE_SUPABASE_ANON_KEY=...
```
VITE_API_URL=http://localhost:8000
```
### Error Handling & Fallback
- Each backend call is wrapped; on failure, a warning logs to console and Supabase fallback path executes.
Add new modules under `src/lib/api/` (pattern used by `employees.ts`, `attendance.ts`, `logs.ts`). Use `http()` helper for consistent error handling and base URL logic.

## Google Gemini API Integration (Optional)
1. **Get API Key:**
   - Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Generate a new API key

3. **Install Package:**
   ```bash
   - Import Gemini SDK
   - Replace simulation with real facial recognition
   - Configure model for face detection
src/
├── components/          # Reusable components
│   ├── CameraView.tsx   # Camera feed component
│   └── ThemeContext.tsx # Theme management
├── pages/               # Application pages
│   ├── Dashboard.tsx    # Main dashboard
├── types/               # TypeScript definitions
│   └── database.ts      # Database types
├── App.tsx              # Main app component
├── main.tsx             # Entry point
└── index.css            # Global styles
```

## Key Features Implementation

### Camera Access
The application requests camera permissions automatically. If denied or unavailable:
- Falls back to simulated camera feed
- Displays appropriate error messages
- Provides retry mechanism

### Theme System
- Toggle between light and dark modes
- Preference persisted in localStorage
- Applies to all components dynamically

### Database Operations
- Real-time data synchronization
- Optimistic UI updates
- Comprehensive error handling
- RLS policies for security

### Responsive Design
Breakpoints:
- Mobile: < 640px
- Tablet: 640px - 1024px
- Desktop: > 1024px

## Security Features

- Row Level Security (RLS) on all tables
- Authentication state management
- Secure API key handling
- Input validation
- XSS protection

## Browser Compatibility

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

- Optimized bundle size
- Efficient re-renders with React hooks
- Semantic HTML
- ARIA labels

## Future Enhancements

- [ ] Real-time WebSocket updates (presence)
- [ ] Server-driven face embedding management
- [ ] Asset storage move from base64 to object storage (Supabase Storage or S3)
- [ ] Role-based admin panel
- [ ] Advanced search & filtering
- [ ] Unit & integration test coverage

## GPU / ONNX Runtime (Optional)

The backend can leverage ONNX Runtime GPU builds for acceleration. Current pins:

```
onnx==1.16.1
onnxruntime-gpu==1.19.2
numpy==1.26.4  # Required for Python 3.12
```

If you need InsightFace (full face recognition) install optional vision extras (recommended Python 3.10/3.11 for prebuilt wheels):

```powershell
pip install -r Backend/requirements-vision.txt
```

Environment tips:
1. Confirm GPU visibility: `nvidia-smi`
2. Within the backend venv test:
   ```powershell
   .\.venv\Scripts\python -c "import onnxruntime as ort;print(ort.get_device())"
   ```
   Expect `GPU` if CUDA EP loaded; else CPU fallback.
3. To disable GPU (force CPU): set env var `ORT_DISABLE_CUDA=1` before starting uvicorn.

### Logs Endpoint Enhancements

`GET /logs` now supports query parameters:

| Param | Description |
|-------|-------------|
| `event_type` | Exact match filter on event type |
| `limit` | Max entries (1-500, default 200) |
| `since` | ISO8601 timestamp (inclusive) |
| `search` | Case-insensitive substring match on description |

Example:
```
/logs?event_type=security&since=2025-10-03T12:00:00Z&search=alert&limit=100
```

Falls back to in-memory buffer if DB unavailable.

## Troubleshooting

### Camera not working
- Check browser permissions
- Ensure HTTPS connection (required for camera access)
- Try different browser
- System uses simulated feed as fallback

### Database connection issues
- Verify SUPABASE_URL and SUPABASE_ANON_KEY in .env
- Check network connectivity
- Review Supabase dashboard for service status

### Build errors
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- Clear build cache: `rm -rf dist`
- Update dependencies: `npm update`

## Testing

Run the type checker:
```bash
npm run typecheck
```

Run unit tests (Vitest):
```bash
npm test
```

Add new tests under `src/__tests__/`.

## License

MIT License - feel free to use for personal or commercial projects.

## Support

For issues or questions, please check the troubleshooting section or review the code comments for detailed implementation notes.
>>>>>>> 77aeb1d (First commit)
