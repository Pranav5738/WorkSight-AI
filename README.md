# Cortexa Vision

Cortexa Vision is a full-stack security and attendance platform built with a React frontend and a FastAPI backend. The app supports face-driven attendance, employee enrollment, system logs, and monitoring workflows. It can run in Supabase-first mode or talk to a local backend through `VITE_API_URL`.

## Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS
- Backend: FastAPI, Uvicorn, SQLAlchemy, Alembic
- Data: PostgreSQL / Supabase
- Vision: OpenCV, ONNX Runtime, InsightFace, MediaPipe

## Run

Install dependencies for both apps:

```bash
npm install
```

Start the full stack from the repo root:

```bash
npm run dev
```

Run only the frontend:

```bash
npm run dev:frontend
```

Run only the backend:

```bash
npm run dev:backend
```

## Backend

The backend entrypoint is [Backend/main.py](Backend/main.py), with shared configuration in [Backend/config.py](Backend/config.py) and database setup in [Backend/db.py](Backend/db.py). Optional vision dependencies are pinned in [Backend/requirements-vision.txt](Backend/requirements-vision.txt).

Useful environment variables:

- `VITE_API_URL` enables backend-first mode in the frontend
- `ENABLE_RATE_LIMIT=1` turns on SlowAPI rate limiting
- `ENABLE_PROMETHEUS=1` exposes metrics when Prometheus is installed
- `RECOGNITION_SIMULATION=1` keeps the fallback recognition path enabled

## Supabase

This project already includes a Supabase-ready schema in [Backend/supabase/migrations/20251002050955_create_security_attendance_schema.sql](Backend/supabase/migrations/20251002050955_create_security_attendance_schema.sql) and a frontend client in [Frontend/src/lib/supabase.ts](Frontend/src/lib/supabase.ts).

Use Supabase in one of two ways:

1. Supabase as the database for the FastAPI backend.
	Set `DATABASE_URL` to your Supabase Postgres connection string in Render or in your local backend env.
2. Supabase as the direct frontend data source.
	Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in [Frontend/.env.example](Frontend/.env.example).

Recommended production setup:

1. Apply the migration from [Backend/supabase/migrations/20251002050955_create_security_attendance_schema.sql](Backend/supabase/migrations/20251002050955_create_security_attendance_schema.sql) in your Supabase SQL editor.
2. Deploy the backend with `DATABASE_URL` pointing at Supabase Postgres.
3. Deploy the frontend with `VITE_API_URL` pointing at the backend URL.
4. Add the frontend URL to `CORS_ORIGINS` in the backend environment.

## Project Layout

- [Frontend/](Frontend/) contains the main web app
- [Backend/](Backend/) contains the FastAPI service and vision pipeline
- [scripts/dev.js](scripts/dev.js) launches the combined dev workflow

## Notes

- The repo now avoids the previous README merge-conflict clutter.
- Root-level legacy files are being trimmed where they are not used by the active app.
