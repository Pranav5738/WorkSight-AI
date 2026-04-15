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

## Project Layout

- [Frontend/](Frontend/) contains the main web app
- [Backend/](Backend/) contains the FastAPI service and vision pipeline
- [scripts/dev.js](scripts/dev.js) launches the combined dev workflow

## Notes

- The repo now avoids the previous README merge-conflict clutter.
- Root-level legacy files are being trimmed where they are not used by the active app.
