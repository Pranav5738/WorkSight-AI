# Cortexa Vision – Demo Runbook

This guide helps you run the project locally for a smooth demo.

## Prerequisites
- Node.js 18+
- Python 3.10 or 3.11 (3.10 recommended if enabling InsightFace)

## Configure
1. Backend: copy `Backend/.env.example` to `Backend/.env` (defaults are fine).
2. Frontend: copy `Frontend/.env.example` to `Frontend/.env`; ensure:
   - `VITE_API_URL=http://127.0.0.1:8000`

## Start
```powershell
# from repo root
npm run dev
```
This launches Backend (Uvicorn on 8000) and Frontend (Vite on 5173). The first run installs dependencies automatically.

## Seed Sample Data
Option A – HTTP:
```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/dev/seed
```
Option B – CLI:
```powershell
cd Backend
 .\.venv\Scripts\python scripts\seed_dev.py
```

## Monitoring Demo
```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/monitoring/demo/start -Body "pattern=Backend/uploads/*.jpg&fps=6" -ContentType "application/x-www-form-urlencoded"
```
Check status:
```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8000/monitoring/status | ConvertTo-Json -Compress
```

## Manager Dashboard
- Open http://localhost:5173 and navigate to “Manager”.
- Adjust policy, refresh, and download daily CSV summaries.

## Diagnostics
- `GET http://127.0.0.1:8000/system/diagnostics` for runtime checks (DB, face model, monitoring, CORS, VBG).

## InsightFace (Optional)
Set `REAL_FACE=1` in `Backend/.env` and use Python 3.10 with the prebuilt wheel if available.
