"""Cortexa Vision Backend main module (API definitions)."""
from fastapi import FastAPI, HTTPException, Request, BackgroundTasks, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import List, Optional, Dict, Any
import random, time, os, smtplib, ssl, csv, io, threading, hashlib, math, base64, json, asyncio, uuid, sys
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel
from datetime import datetime, date

from config import APP_NAME, APP_VERSION, ALLOW_ORIGINS, ALLOW_ORIGIN_REGEX, REQUEST_ID_HEADER, ENABLE_PROMETHEUS
import numpy as np  # for image buffer handling when VBG_FOR_ATTENDANCE
import cv2  # for decoding/encoding frames when VBG_FOR_ATTENDANCE is enabled

# Load environment from Backend/.env early so downstream modules (auth, face) see values
try:
    from dotenv import load_dotenv  # type: ignore
    from pathlib import Path as _P
    _ENV_PATH = _P(__file__).parent / '.env'
    if _ENV_PATH.exists():
        load_dotenv(dotenv_path=_ENV_PATH)
    else:
        load_dotenv()
except Exception:
    pass

def _now_iso():
    return datetime.utcnow().isoformat(timespec='milliseconds') + 'Z'

def _emit_json_log(event_type: str, message: str, level: str = 'INFO', **fields):
    rec = {'ts': _now_iso(), 'event': event_type, 'message': message, 'level': level}
    if fields:
        rec.update(fields)
    try:
        sys.stdout.write(json.dumps(rec, separators=(',',':')) + '\n')
    except Exception:
        pass

# Optional rate limiting (slowapi) guarded by env ENABLE_RATE_LIMIT=1
ENABLE_RATE_LIMIT = os.getenv('ENABLE_RATE_LIMIT', '0') == '1'
if ENABLE_RATE_LIMIT:
    try:  # lazy import so environments without lib still run
        from slowapi import Limiter  # type: ignore
        from slowapi.util import get_remote_address  # type: ignore
        from slowapi.errors import RateLimitExceeded  # type: ignore
        from slowapi.middleware import SlowAPIMiddleware  # type: ignore
        limiter = Limiter(key_func=get_remote_address, default_limits=[])
        # Rate strings configurable via env (fallback defaults)
        RATE_LOGIN = os.getenv('RATE_LOGIN', '5/minute')
        RATE_REFRESH = os.getenv('RATE_REFRESH', '10/minute')
        RATE_IDENTIFY = os.getenv('RATE_IDENTIFY', '120/minute')
        RATE_ATTENDANCE = os.getenv('RATE_ATTENDANCE', '240/minute')
        RATE_EMP_ENCODE = os.getenv('RATE_EMP_ENCODE', '20/hour')
    except Exception:
        ENABLE_RATE_LIMIT = False
        limiter = None  # type: ignore
else:
    limiter = None  # type: ignore
import random, time, os, smtplib, ssl, csv, io, threading, hashlib, math, base64, json, asyncio, uuid, sys
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel
from datetime import datetime, date

from config import APP_NAME, APP_VERSION, ALLOW_ORIGINS, REQUEST_ID_HEADER, ENABLE_PROMETHEUS

def _now_iso():
    return datetime.utcnow().isoformat(timespec='milliseconds') + 'Z'

def _emit_json_log(event_type: str, message: str, level: str = 'INFO', **fields):
    rec = {'ts': _now_iso(), 'event': event_type, 'message': message, 'level': level}
    if fields:
        rec.update(fields)
    try:
        sys.stdout.write(json.dumps(rec, separators=(',',':')) + '\n')
    except Exception:
        pass

# Optional rate limiting (slowapi) guarded by env ENABLE_RATE_LIMIT=1
ENABLE_RATE_LIMIT = os.getenv('ENABLE_RATE_LIMIT', '0') == '1'
if ENABLE_RATE_LIMIT:
    try:  # lazy import so environments without lib still run
        from slowapi import Limiter  # type: ignore
        from slowapi.util import get_remote_address  # type: ignore
        from slowapi.errors import RateLimitExceeded  # type: ignore
        from slowapi.middleware import SlowAPIMiddleware  # type: ignore
        limiter = Limiter(key_func=get_remote_address, default_limits=[])
        # Rate strings configurable via env (fallback defaults)
        RATE_LOGIN = os.getenv('RATE_LOGIN', '5/minute')
        RATE_REFRESH = os.getenv('RATE_REFRESH', '10/minute')
        RATE_IDENTIFY = os.getenv('RATE_IDENTIFY', '120/minute')
        RATE_ATTENDANCE = os.getenv('RATE_ATTENDANCE', '240/minute')
        RATE_EMP_ENCODE = os.getenv('RATE_EMP_ENCODE', '20/hour')
    except Exception as _rl_ex:  # pragma: no cover
        _emit_json_log('ratelimit.disabled', 'Import failed; disabling rate limiting', error=str(_rl_ex), level='WARN')
        ENABLE_RATE_LIMIT = False
        limiter = None  # type: ignore
else:
    limiter = None  # type: ignore

# Toggle recognition simulation when embeddings are unavailable
RECOGNITION_SIMULATION_ENABLED = os.getenv('RECOGNITION_SIMULATION', '1') == '1'

app = FastAPI(title=APP_NAME, version=APP_VERSION)

# Optional database + models bootstrap (non-fatal if deps missing)
try:
    from db import Base, engine, get_db  # type: ignore
    import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    from sqlalchemy.orm import Session  # type: ignore
except Exception as e:  # pragma: no cover - environment may not have SQLAlchemy yet
    _emit_json_log('startup.db_skip', 'DB init skipped', error=str(e), level='WARN')
    Session = None  # type: ignore

try:
    from face_pipeline import compute_embedding_from_bytes, insightface_status  # type: ignore
except Exception as e:
    _emit_json_log('startup.face_pipeline_fallback', 'Using hash embedding fallback', error=str(e), level='WARN')
    def compute_embedding_from_bytes(raw: bytes):  # fallback replicating old hash logic
        h = hashlib.sha256(raw).digest()
        buf = (h * ((64 // len(h)) + 1))[:64]
        vec = [b / 255.0 for b in buf]
        import math as _m
        n = _m.sqrt(sum(v*v for v in vec)) or 1.0
        return type('EmbRes', (), {
            'vector': [round(v / n, 6) for v in vec],
            'model': 'hash-v1'
        })()
    def insightface_status():  # type: ignore
        return {'enabled': False, 'model_name': 'hash-v1', 'loaded': False, 'ctx_id': 0, 'det_size': (640,640), 'import_error': 'face pipeline not available'}

# Optional background removal for recognition input frames (controlled by env)
VBG_FOR_ATTENDANCE = os.getenv('VBG_FOR_ATTENDANCE', '1') == '1'
try:
    # Import lazily; if missing mediapipe, the feature silently disables
    from utils import BgConfig, try_apply_virtual_background  # type: ignore
except Exception:
    VBG_FOR_ATTENDANCE = False
    BgConfig = None  # type: ignore
    def try_apply_virtual_background(x, y):  # type: ignore
        return x

# CORS configuration
origins = ALLOW_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=ALLOW_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

REQUEST_ID_CTX_KEY = 'request_id'

class CorrelationIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get(REQUEST_ID_HEADER, str(uuid.uuid4()))
        request.state.request_id = rid
        start = time.time()
        try:
            response = await call_next(request)
        except Exception as ex:
            log_event('request.error', 'Unhandled exception', {'path': request.url.path, 'error': str(ex), 'request_id': rid})
            raise
        duration = round((time.time() - start) * 1000, 2)
        response.headers[REQUEST_ID_HEADER] = rid
        response.headers['X-Response-Time-ms'] = str(duration)
        return response

app.add_middleware(CorrelationIdMiddleware)
if ENABLE_RATE_LIMIT and limiter is not None:
    # Attach SlowAPI middleware
    app.state.limiter = limiter
    app.add_middleware(SlowAPIMiddleware)
    from fastapi.responses import JSONResponse
    @app.exception_handler(RateLimitExceeded)
    async def _rate_limit_handler(request: Request, exc: RateLimitExceeded):
        rid = getattr(request.state, 'request_id', None)
        return JSONResponse(status_code=429, content={'error': 'Rate limit exceeded', 'detail': str(exc), 'request_id': rid})

METRICS_ENABLED = False  # will flip to True if prometheus instrumentation loads
# Quiet metrics setup: only configure if library is present; no warning if missing.
if ENABLE_PROMETHEUS:
    import importlib
    _prom_spec = importlib.util.find_spec('prometheus_client')
    if _prom_spec:
        try:  # pragma: no cover (optional path)
            from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST  # type: ignore
            REQ_COUNTER = Counter('cortexa_requests_total', 'Total HTTP requests', ['method','path','status'])
            REQ_LATENCY = Histogram('cortexa_request_latency_seconds', 'Request latency', ['method','path'])
            METRICS_ENABLED = True

            @app.middleware('http')
            async def metrics_middleware(request: Request, call_next):
                method = request.method
                path = request.url.path
                start = time.time()
                response = await call_next(request)
                elapsed = time.time() - start
                try:
                    REQ_COUNTER.labels(method=method, path=path, status=response.status_code).inc()
                    REQ_LATENCY.labels(method=method, path=path).observe(elapsed)
                except Exception:
                    pass
                return response

            @app.get('/metrics')
            async def metrics():
                from fastapi import Response
                return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
        except Exception:
            # Silent disable (library present but failed to initialize properly)
            METRICS_ENABLED = False

@app.get('/system/metrics/status')
async def metrics_status():
    if not (ENABLE_PROMETHEUS and METRICS_ENABLED):
        return {'enabled': False}
    # Provide lightweight instrumentation summary (no heavy introspection)
    return {
        'enabled': True,
        'counters': ['cortexa_requests_total'],
        'histograms': ['cortexa_request_latency_seconds']
    }

@app.get('/system/diagnostics')
async def system_diagnostics():
    """Lightweight diagnostics to validate environment and critical integrations."""
    diag: Dict[str, Any] = {}
    # Python/runtime
    try:
        import sys as _sys
        diag['python'] = _sys.version
    except Exception:
        diag['python'] = 'unknown'
    # DB
    try:
        diag['db'] = {'ok': db_health()}  # type: ignore[name-defined]
    except Exception as ex:
        diag['db'] = {'ok': False, 'error': str(ex)}
    # InsightFace / face pipeline
    try:
        diag['face_model'] = insightface_status()  # type: ignore
    except Exception as ex:
        diag['face_model'] = {'enabled': False, 'error': str(ex)}
    # Monitoring
    diag['monitoring'] = {
        'enabled': MONITORING_ENABLED,
        'config_path': MONITORING_CONFIG_PATH,
    }
    # VBG
    diag['virtual_background'] = {
        'attendance_enabled': VBG_FOR_ATTENDANCE,
        'monitoring_enabled': bool(os.getenv('VBG_ENABLED', '1') == '1')
    }
    # CORS / rate limiting
    diag['security'] = {
        'rate_limiting': bool(ENABLE_RATE_LIMIT and limiter is not None),
        'cors': {
            'allow_origins': origins,
            'allow_regex': ALLOW_ORIGIN_REGEX
        }
    }
    return diag

@app.get("/")
async def root():
    return {"message": "Welcome to Cortexa Vision Backend API"}

@app.get('/healthz')
async def healthz():
    return {'ok': True, 'version': app.version}

@app.get('/readyz')
async def readyz():
    details = {}
    overall = True
    # DB readiness (if DB mode)
    if 'USE_DB' in globals() and USE_DB:
        try:
            from db import db_health
            db_ok = db_health()
            details['db'] = db_ok
            if not db_ok:
                overall = False
        except Exception as ex:
            details['db'] = False
            overall = False
            log_event('readiness.error', 'DB health check failed', {'error': str(ex)})
    details['embedding_worker'] = EMBEDDING_WORKER_ALIVE
    if not EMBEDDING_WORKER_ALIVE:
        overall = False
    # Face model readiness (optional)
    try:
        details['face_model'] = insightface_status()  # type: ignore
    except Exception as ex:
        details['face_model'] = {'enabled': False, 'model_name': 'hash-v1', 'loaded': False, 'error': str(ex)}
    details['rate_limiting'] = bool(ENABLE_RATE_LIMIT and limiter is not None)
    return { 'ready': overall, 'details': details, 'version': app.version }

# ---- Dev seed endpoint (optional) ----
@app.post('/dev/seed')
async def dev_seed():
    """Populate sample database rows for quick demos.
    Creates 3 employees, simple embeddings (hash fallback), a preference policy,
    and a few productivity counters for today.
    """
    try:
        from db import SessionLocal
        from sqlalchemy import select
        from models import Employee, Embedding, Preference
        from datetime import datetime, timezone
        from monitoring.aggregator import ProductivityAggregator
        # ensure tables exist
        try:
            Base.metadata.create_all(bind=engine)  # type: ignore
        except Exception:
            pass
        created = []
        with SessionLocal() as db:
            # employees
            demo = [
                {'employee_id': 'E001', 'full_name': 'Alice Johnson'},
                {'employee_id': 'E002', 'full_name': 'Bob Smith'},
                {'employee_id': 'E003', 'full_name': 'Charlie Kim'},
            ]
            rows = db.execute(select(Employee).where(Employee.employee_id.in_([d['employee_id'] for d in demo]))).scalars().all()
            existing = {r.employee_id: r for r in rows}
            for d in demo:
                if d['employee_id'] in existing:
                    continue
                r = Employee(employee_id=d['employee_id'], full_name=d['full_name'], embedding_status='ready')
                db.add(r)
                db.flush()
                # create deterministic hash embedding from employee_id
                vec = compute_embedding_from_bytes(d['employee_id'].encode('utf-8')).vector  # type: ignore
                db.add(Embedding(employee_id=r.id, vector=' '.join(str(x) for x in vec), model='hash-v1', dim=len(vec)))
                created.append(d['employee_id'])
            # preferences
            pref = db.execute(select(Preference).where(Preference.key=='monitoring_policy')).scalars().first()
            if not pref:
                p = Preference(key='monitoring_policy', value={ 'idle_minutes': 30, 'idle_deduction': 50, 'away_minutes': 15, 'away_deduction': 25 })
                db.add(p)
            db.commit()
        # add a bit of productivity counts in DB-backed aggregator
        agg = ProductivityAggregator(use_db=True)
        for i, emp in enumerate(['E001','E002','E003']):
            # sprinkle seconds in different states
            agg.add_seconds(employee_id=emp, state='working', seconds=120 + i*30)
            agg.add_seconds(employee_id=emp, state='idle', seconds=60 + i*10)
            agg.add_seconds(employee_id=emp, state='away', seconds=20)
        return { 'ok': True, 'created': created }
    except Exception as ex:
        raise HTTPException(status_code=500, detail=f'Seed failed: {ex}')

# ===== Monitoring (optional) =====
# Guard monitoring import behind an env flag to avoid heavy deps on test runs.
MONITORING_ENABLED = os.getenv('MONITORING_ENABLED', '0') == '1'
MONITORING_CONFIG_PATH = os.getenv('MONITORING_CONFIG', str((os.path.dirname(__file__) if '__file__' in globals() else '.') + '/monitoring/config.json'))
_MONITORING_AVAILABLE = False
if MONITORING_ENABLED:
    try:
        from monitoring.main import get_service as _get_monitoring_service  # type: ignore
        _MONITORING_AVAILABLE = True
    except Exception as ex:
        _emit_json_log('monitoring.init_failed', 'Monitoring disabled due to import error', error=str(ex), level='WARN')
        MONITORING_ENABLED = False

class ManagerNotification(BaseModel):
    employee_id: str | None = None
    track_id: int | None = None
    state: str
    duration_sec: float
    message: str | None = None
    extras: dict | None = None

@app.post('/notify_manager')
async def notify_manager(payload: ManagerNotification):
    # Mock endpoint to accept notifications from AlertManager
    _emit_json_log('monitoring.notify', 'Manager notified', state=payload.state, duration=payload.duration_sec, employee_id=payload.employee_id, track_id=payload.track_id)
    return {'ok': True, 'received': payload.dict()}

@app.post('/monitoring/start')
async def monitoring_start():
    if not MONITORING_ENABLED or not _MONITORING_AVAILABLE:
        raise HTTPException(status_code=400, detail='Monitoring is disabled')
    svc = _get_monitoring_service(MONITORING_CONFIG_PATH)
    svc.start()
    return {'running': True}

@app.post('/monitoring/stop')
async def monitoring_stop():
    if not MONITORING_ENABLED or not _MONITORING_AVAILABLE:
        raise HTTPException(status_code=400, detail='Monitoring is disabled')
    svc = _get_monitoring_service(MONITORING_CONFIG_PATH)
    svc.stop()
    return {'running': False}

@app.post('/monitoring/demo/start')
async def monitoring_demo_start(request: Request):
    """Start monitoring in demo mode using images.

    Accepts flexible body formats:
      - JSON object e.g. {"pattern": "uploads/*.jpg", "fps": 6}
      - Text/plain or mis-sent string ("[object Object]") -> ignored safely
      - application/x-www-form-urlencoded e.g. pattern=uploads/*.jpg&fps=6

    Keys:
      - pattern: glob or directory for demo frames (e.g., Backend/uploads/*.jpg)
      - fps: frames per second for cycling demo images
      - idle_sec, away_sec: thresholds for alerts
    """
    if not MONITORING_ENABLED or not _MONITORING_AVAILABLE:
        raise HTTPException(status_code=400, detail='Monitoring is disabled')
    svc = _get_monitoring_service(MONITORING_CONFIG_PATH)
    try:
        # Parse body robustly
        body: dict[str, Any] = {}
        try:
            payload = await request.json()
            if isinstance(payload, dict):
                body = payload
        except Exception:
            # Try text or form-encoded
            try:
                raw = (await request.body()).decode('utf-8', errors='ignore').strip()
            except Exception:
                raw = ''
            if raw and '=' in raw:
                from urllib.parse import parse_qs
                qs = parse_qs(raw)
                body = {k: (v[0] if isinstance(v, list) and v else v) for k, v in qs.items()}
            else:
                # Ignore non-JSON strings like "[object Object]"
                body = {}

        pat = body.get('pattern') if isinstance(body, dict) else None
        fps = body.get('fps') if isinstance(body, dict) else None
        idle_sec = body.get('idle_sec') if isinstance(body, dict) else None
        away_sec = body.get('away_sec') if isinstance(body, dict) else None
        if pat:
            svc.cfg['VIDEO_SOURCE'] = f'demo:{pat}'
        if fps:
            svc.cfg['DEMO_FPS'] = float(fps)
        if idle_sec:
            svc.cfg['IDLE_THRESHOLD_SECONDS'] = float(idle_sec)
        if away_sec:
            svc.cfg['AWAY_THRESHOLD_SECONDS'] = float(away_sec)
        # re-init camera based on new config and start
        if hasattr(svc, '_init_camera'):
            svc._init_camera()  # type: ignore[attr-defined]
        svc.start()
        return {'running': True, 'demo': True}
    except Exception as ex:
        raise HTTPException(status_code=400, detail=f'Failed to start demo: {ex}')

@app.get('/monitoring/status')
async def monitoring_status():
    try:
        if not MONITORING_ENABLED or not _MONITORING_AVAILABLE:
            return {'enabled': False}
        svc = _get_monitoring_service(MONITORING_CONFIG_PATH)
        # consider service running if thread is alive and camera started
        running = getattr(svc, '_thread', None) is not None and getattr(svc._thread, 'is_alive', lambda: False)()
        alerts = [
            {
                'ts': a.timestamp,
                'employee_id': a.employee_id,
                'track_id': a.track_id,
                'state': a.state,
                'duration_sec': a.duration_sec,
                'message': a.message,
            }
            for a in svc.alerts.log[-50:]
        ]
        return {
            'enabled': True,
            'running': running,
            'alerts': alerts,
            'config': { 'video_source': svc.cfg.get('VIDEO_SOURCE'), 'demo_fps': svc.cfg.get('DEMO_FPS') }
        }
    except Exception as ex:
        _emit_json_log('monitoring.status.error', 'Failed to build status', error=str(ex), level='ERROR')
        # Return disabled to avoid throwing 500s in demo
        return {'enabled': False, 'error': str(ex)}

# --- Monitoring auto-start (normal or demo) controlled by env ---
MONITORING_AUTOSTART = os.getenv('MONITORING_AUTOSTART', '0') == '1'
MONITORING_AUTOSTART_DEMO = os.getenv('MONITORING_AUTOSTART_DEMO', '0') == '1'
MONITORING_DEMO_PATTERN = os.getenv('MONITORING_DEMO_PATTERN', 'Backend/uploads/*.jpg')
try:
    MONITORING_DEMO_FPS = float(os.getenv('MONITORING_DEMO_FPS', '6'))
    MONITORING_DEMO_IDLE = float(os.getenv('MONITORING_DEMO_IDLE_SEC', '5'))
    MONITORING_DEMO_AWAY = float(os.getenv('MONITORING_DEMO_AWAY_SEC', '5'))
except Exception:
    MONITORING_DEMO_FPS, MONITORING_DEMO_IDLE, MONITORING_DEMO_AWAY = 6.0, 5.0, 5.0

@app.on_event('startup')
async def _monitoring_autostart():
    """Optionally start monitoring or demo on app startup based on env flags."""
    if not (MONITORING_ENABLED and _MONITORING_AVAILABLE):
        return
    try:
        svc = _get_monitoring_service(MONITORING_CONFIG_PATH)
        if MONITORING_AUTOSTART_DEMO:
            svc.cfg['VIDEO_SOURCE'] = f'demo:{MONITORING_DEMO_PATTERN}'
            svc.cfg['DEMO_FPS'] = MONITORING_DEMO_FPS
            svc.cfg['IDLE_THRESHOLD_SECONDS'] = MONITORING_DEMO_IDLE
            svc.cfg['AWAY_THRESHOLD_SECONDS'] = MONITORING_DEMO_AWAY
            if hasattr(svc, '_init_camera'):
                svc._init_camera()  # type: ignore[attr-defined]
            svc.start()
            _emit_json_log('monitoring.autostart', 'Demo monitoring auto-started', pattern=MONITORING_DEMO_PATTERN, fps=MONITORING_DEMO_FPS)
        elif MONITORING_AUTOSTART:
            svc.start()
            _emit_json_log('monitoring.autostart', 'Monitoring auto-started')
    except Exception as ex:
        _emit_json_log('monitoring.autostart.error', 'Failed to auto-start monitoring', error=str(ex), level='ERROR')


class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int
    user: dict


TOKEN_EXP_SECONDS = 3600

def _validate_credentials(username: str, password: str) -> bool:
    # Delegate to auth.authenticate_user which checks hashed passwords & lockouts.
    from auth import authenticate_user
    return authenticate_user(username, password) is not None

from auth import authenticate_user, issue_tokens, decode_token, UserRecord

security = HTTPBearer(auto_error=False)

def _build_login_response(user: UserRecord) -> LoginResponse:
    toks = issue_tokens(user)
    return LoginResponse(
        access_token=toks['access_token'],
        refresh_token=toks['refresh_token'],
        expires_in=toks['expires_in'],
        user=toks['user']
    )


def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)):
    if not creds:
        raise HTTPException(status_code=401, detail='Not authenticated')
    token = creds.credentials
    data = decode_token(token)
    if not data or data.token_type != 'access':
        raise HTTPException(status_code=401, detail='Invalid token')
    return data

def require_roles(*roles: str):
    def _dep(user = Depends(get_current_user)):
        if not any(r in user.roles for r in roles):
            raise HTTPException(status_code=403, detail='Forbidden')
        return user
    return _dep

@app.post("/auth/login", response_model=LoginResponse)
async def auth_login(request: Request):
    # Accept JSON or form-encoded; be resilient to minor client inconsistencies.
    try:
        payload = await request.json()
    except Exception:
        # Try form or raw bytes
        raw = await request.body()
        try:
            from urllib.parse import parse_qs
            qs = parse_qs(raw.decode(errors='ignore'))
            payload = { k: (v[0] if isinstance(v, list) and v else v) for k, v in qs.items() }
        except Exception:
            payload = {}

    username = (payload.get('username') or '').strip()
    password = (payload.get('password') or '').strip()
    if not username or not password:
        raise HTTPException(status_code=400, detail='Username and password are required.')

    user = authenticate_user(username, password)
    if not user:
        # Fallback: if matches configured default admin credentials, ensure user exists and allow login.
        try:
            from auth import _USERS as _AUTH_USERS, _force_add_user as _ensure_user, _DEFAULT_ADMIN as _DEF_U, _DEFAULT_PASS as _DEF_P  # type: ignore
            if username == _DEF_U and password == _DEF_P:
                if username not in _AUTH_USERS:
                    _ensure_user(_DEF_U, _DEF_P, ['admin'])
                user = _AUTH_USERS[username]
            else:
                raise HTTPException(status_code=401, detail='Invalid credentials')
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=401, detail='Invalid credentials')
    return _build_login_response(user)
if ENABLE_RATE_LIMIT and limiter is not None:  # apply rate limit
    auth_login = limiter.limit(RATE_LOGIN)(auth_login)  # type: ignore

@app.post("/api/login")
async def legacy_login(req: LoginRequest):
    # Kept for backward compatibility. Returns minimal structure but still validates credentials.
    if not _validate_credentials(req.username, req.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    # Provide a hint to update frontend if someone still calls this route.
    return {"message": "Login successful (legacy endpoint)", "token": "dummy-access"}

@app.get('/auth/users')
async def auth_users():
    # Debug helper to list available usernames (no hashes). Remove in production.
    try:
        from auth import list_users
        return { 'users': list_users() }
    except Exception as ex:
        raise HTTPException(status_code=500, detail=f'Unable to list users: {ex}')


# ===== Recognition Simulation =====
class RosterItem(BaseModel):
    id: str
    name: Optional[str] = None
    photo_url: Optional[str] = None

class IdentifyRequest(BaseModel):
    image_base64: str
    roster: List[RosterItem]
    threshold: Optional[float] = None

class IdentifyResponse(BaseModel):
    identified: bool
    employee_id: Optional[str] = None
    confidence: float
    method: Optional[str] = None  # embedding | simulated | none | other model name

class CandidateScore(BaseModel):
    employee_id: str
    similarity: float
    ready: bool

class DiagnosticsResponse(BaseModel):
    threshold: float
    roster_count: int
    evaluated: int
    method: Optional[str]
    top: List[CandidateScore]

@app.post("/recognition/identify", response_model=IdentifyResponse)
async def recognition_identify(req: IdentifyRequest):
    """Attempt identification using deterministic pseudo-embeddings; fallback to simulation.
    Embedding logic:
      - Employees created with photos are asynchronously assigned an embedding (hash-based placeholder).
      - If roster employees all have ready embeddings, we compute cosine similarity with live frame embedding.
    """
    time.sleep(0.05)  # small simulated processing latency

    if not req.roster:
        return IdentifyResponse(identified=False, employee_id=None, confidence=0.0, method=None)

    threshold = IN_MEMORY_SETTINGS.get('confidence_threshold', 0.55)
    if req.threshold is not None:
        # Use per-request threshold from UI while enforcing safe bounds.
        threshold = min(0.99, max(0.0, float(req.threshold)))

    roster_embeddings: list[tuple[str, list[float]]]
    roster_embeddings = []
    if 'USE_DB' in globals() and USE_DB:
        try:
            from sqlalchemy import select
            from models import Employee as EmployeeModel, Embedding as EmbeddingModel
            from db import SessionLocal
            with SessionLocal() as db:
                roster_ids = [r.id for r in req.roster]
                rows = db.execute(select(EmployeeModel).where(EmployeeModel.employee_id.in_(roster_ids))).scalars().all()
                emp_map = {row.id: row for row in rows}
                # fetch embeddings
                if rows:
                    emb_rows = db.execute(select(EmbeddingModel).where(EmbeddingModel.employee_id.in_([row.id for row in rows]))).scalars().all()
                    emb_by_emp = {er.employee_id: er for er in emb_rows}
                    for row in rows:
                        status = getattr(row, 'embedding_status', None)
                        if status == 'ready' and row.id in emb_by_emp:
                            raw_vec = emb_by_emp[row.id].vector
                            try:
                                vec = json.loads(raw_vec) if raw_vec.startswith('[') else [float(x) for x in raw_vec.split()]
                                roster_embeddings.append((row.employee_id, vec))
                            except Exception:
                                pass
        except Exception as ex:
            log_event('recognition.db_error', 'Failed DB embedding load', {'error': str(ex)})
    else:
        # In-memory fallback
        all_emp = { e['employee_id']: e for e in EMPLOYEE_SEED }
        for e in IN_MEMORY_EMPLOYEES:
            all_emp[e['employee_id']] = e
        for r in req.roster:
            emp = all_emp.get(r.id) or all_emp.get(r.name or '')
            if emp and emp.get('encoding_status') == 'ready' and isinstance(emp.get('embedding'), list):
                roster_embeddings.append((emp['employee_id'], emp['embedding']))

    if roster_embeddings:
        if req.image_base64.startswith('data:image') and ',' in req.image_base64:
            try:
                live_bytes = base64.b64decode(req.image_base64.split(',',1)[1])
            except Exception:
                live_bytes = req.image_base64.encode()
        else:
            live_bytes = req.image_base64.encode()
        # Optional: background removal before computing embedding
        if VBG_FOR_ATTENDANCE:
            try:
                # Decode to BGR frame
                arr = np.frombuffer(live_bytes, dtype=np.uint8)
                bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                if bgr is not None:
                    bg_cfg = BgConfig(mode=os.getenv('VBG_MODE', 'color'),
                                      color=tuple(int(x) for x in os.getenv('VBG_COLOR', '200,200,200').split(',')),
                                      image_path=os.getenv('VBG_IMAGE_PATH') or None,
                                      process_short_side=int(os.getenv('VBG_SHORT_SIDE', '256')),
                                      threshold=float(os.getenv('VBG_THRESHOLD', '0.1')))
                    bgr = try_apply_virtual_background(bgr, bg_cfg)
                    # Re-encode to JPEG bytes for embedding
                    ok, enc = cv2.imencode('.jpg', bgr)
                    if ok:
                        live_bytes = enc.tobytes()
            except Exception:
                pass
        emb_res = compute_embedding_from_bytes(live_bytes)
        live_emb = emb_res.vector
        model_method = getattr(emb_res, 'model', 'embedding') or 'embedding'
        best_emp = None
        best_score = -1.0
        for emp_id, emb in roster_embeddings:
            if len(emb) != len(live_emb):
                continue
            score = sum(x*y for x,y in zip(emb, live_emb))
            if score > best_score:
                best_score = score
                best_emp = emp_id
        confidence = round(best_score, 3)
        if best_emp and confidence >= threshold:
            return IdentifyResponse(identified=True, employee_id=best_emp, confidence=confidence, method=model_method)
        return IdentifyResponse(identified=False, employee_id=None, confidence=confidence, method=model_method)

    # Fallback simulation (legacy) if no embeddings available
    if not RECOGNITION_SIMULATION_ENABLED:
        # Explicitly disabled by environment: never simulate a positive
        return IdentifyResponse(identified=False, employee_id=None, confidence=0.0, method='simulated')
    if random.random() < 0.4:
        picked = random.choice(req.roster)
        confidence = round(random.uniform(0.55, 0.92), 3)
        if confidence < threshold:
            return IdentifyResponse(identified=False, employee_id=None, confidence=confidence, method='simulated')
        return IdentifyResponse(identified=True, employee_id=picked.id, confidence=confidence, method='simulated')
    low_conf = round(random.uniform(0.2, 0.54), 3)
    return IdentifyResponse(identified=False, employee_id=None, confidence=low_conf, method='simulated')

if ENABLE_RATE_LIMIT and limiter is not None:
    recognition_identify = limiter.limit(RATE_IDENTIFY)(recognition_identify)  # type: ignore

    # (Removed duplicate legacy simulation tail)

    @app.post('/recognition/diagnostics', response_model=DiagnosticsResponse)
    async def recognition_diagnostics(req: IdentifyRequest):
        """Return per-roster candidate similarity scores for a given frame without making a decision.
        Useful for threshold tuning and ROC analysis tooling.
        """
        threshold = IN_MEMORY_SETTINGS.get('confidence_threshold', 0.55)
        if req.threshold is not None:
            threshold = min(0.99, max(0.0, float(req.threshold)))
        if not req.roster:
            return DiagnosticsResponse(threshold=threshold, roster_count=0, evaluated=0, method=None, top=[])
        roster_embeddings: list[tuple[str, list[float]]] = []
        method = None
        if 'USE_DB' in globals() and USE_DB:
            try:
                from sqlalchemy import select
                from models import Employee as EmployeeModel, Embedding as EmbeddingModel
                from db import SessionLocal
                with SessionLocal() as db:
                    roster_ids = [r.id for r in req.roster]
                    rows = db.execute(select(EmployeeModel).where(EmployeeModel.employee_id.in_(roster_ids))).scalars().all()
                    if rows:
                        emb_rows = db.execute(select(EmbeddingModel).where(EmbeddingModel.employee_id.in_([r.id for r in rows]))).scalars().all()
                        emb_by_emp = {er.employee_id: er for er in emb_rows}
                        for row in rows:
                            if getattr(row, 'embedding_status', None) == 'ready' and row.id in emb_by_emp:
                                raw_vec = emb_by_emp[row.id].vector
                                try:
                                    vec = json.loads(raw_vec) if raw_vec.startswith('[') else [float(x) for x in raw_vec.split()]
                                    roster_embeddings.append((row.employee_id, vec))
                                except Exception:
                                    pass
            except Exception as ex:
                log_event('diagnostics.db_error', 'Failed to load DB embeddings', {'error': str(ex)})
        else:
            all_emp = { e['employee_id']: e for e in EMPLOYEE_SEED }
            for e in IN_MEMORY_EMPLOYEES:
                all_emp[e['employee_id']] = e
            for r in req.roster:
                emp = all_emp.get(r.id) or all_emp.get(r.name or '')
                if emp and emp.get('encoding_status') == 'ready' and isinstance(emp.get('embedding'), list):
                    roster_embeddings.append((emp['employee_id'], emp['embedding']))
        if not roster_embeddings:
            return DiagnosticsResponse(threshold=threshold, roster_count=len(req.roster), evaluated=0, method=None, top=[])
        # Build live vector
        if req.image_base64.startswith('data:image') and ',' in req.image_base64:
            try:
                live_bytes = base64.b64decode(req.image_base64.split(',',1)[1])
            except Exception:
                live_bytes = req.image_base64.encode()
        else:
            live_bytes = req.image_base64.encode()
        live_emb = compute_embedding_from_bytes(live_bytes).vector
        method = 'embedding'
        scores: list[CandidateScore] = []
        for emp_id, emb in roster_embeddings:
            if len(emb) != len(live_emb):
                continue
            sim = round(sum(x*y for x,y in zip(emb, live_emb)), 6)
            scores.append(CandidateScore(employee_id=emp_id, similarity=sim, ready=True))
        # Sort descending
        scores.sort(key=lambda s: s.similarity, reverse=True)
        # Cap to top 25 to keep payload small
        scores = scores[:25]
        return DiagnosticsResponse(threshold=threshold, roster_count=len(req.roster), evaluated=len(scores), method=method, top=scores)

# ================= Additional Stub Endpoints (In-memory) =================
class TokenRefreshRequest(BaseModel):
    refresh_token: str

@app.post('/auth/refresh')
async def refresh_token(req: TokenRefreshRequest):
    data = decode_token(req.refresh_token)
    if not data or data.token_type != 'refresh':
        raise HTTPException(status_code=401, detail='Invalid refresh token')
    user = UserRecord(username=data.username, password_hash='', roles=data.roles)
    toks = issue_tokens(user)
    return toks
if ENABLE_RATE_LIMIT and limiter is not None:
    refresh_token = limiter.limit(RATE_REFRESH)(refresh_token)  # type: ignore

@app.post('/auth/logout')
async def auth_logout():
    # Stateless JWT logout placeholder (frontend just discards tokens)
    return { 'logged_out': True }

@app.get('/auth/me')
async def auth_me(user = Depends(get_current_user)):
    return { 'user': { 'username': user.username, 'roles': user.roles } }

# ---- Exception Handling (basic structured) ----
from fastapi.responses import JSONResponse
@app.exception_handler(HTTPException)
async def http_exc_handler(request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={'error': exc.detail})

    # (Moved refresh handler implementation above)

from pydantic import Field
from typing import TypedDict


# ===== Monitoring summaries & deductions =====
class ProductivitySummaryOut(BaseModel):
    date: str
    totals: Dict[str | None, Dict[str, float]]

class DeductionPolicyIn(BaseModel):
    idle_minutes: int = 30
    idle_deduction: float = 50.0
    away_minutes: int = 15
    away_deduction: float = 25.0

@app.get('/monitoring/summary', response_model=ProductivitySummaryOut)
async def monitoring_summary(date: str | None = None):
    try:
        from monitoring.main import get_service as _get_monitoring_service  # type: ignore
        svc = _get_monitoring_service(MONITORING_CONFIG_PATH)
        totals = svc.aggregator.get_summary(date)
        return ProductivitySummaryOut(date=date or '', totals=totals)
    except Exception as ex:
        raise HTTPException(status_code=400, detail=f'Failed to summarize: {ex}')

@app.post('/monitoring/deductions')
async def monitoring_deductions(policy: DeductionPolicyIn):
    try:
        from monitoring.main import get_service as _get_monitoring_service  # type: ignore
        svc = _get_monitoring_service(MONITORING_CONFIG_PATH)
        totals = svc.aggregator.get_summary()
        out: Dict[str | None, Dict[str, float]] = {}
        for emp, stats in totals.items():
            idle_m = (stats.get('idle_sec', 0.0) or 0.0) / 60.0
            away_m = (stats.get('away_sec', 0.0) or 0.0) / 60.0
            deduction = 0.0
            if idle_m > policy.idle_minutes:
                deduction += policy.idle_deduction
            if away_m > policy.away_minutes:
                deduction += policy.away_deduction
            out[emp] = { **stats, 'idle_min': idle_m, 'away_min': away_m, 'deduction': deduction }
        return { 'policy': policy.dict(), 'totals': out }
    except Exception as ex:
        raise HTTPException(status_code=400, detail=f'Failed to compute deductions: {ex}')

@app.get('/monitoring/summary.csv')
async def monitoring_summary_csv(date: str | None = None):
    """CSV export of daily totals per employee.
    Columns: employee_id, working_sec, idle_sec, away_sec, sleeping_sec
    """
    try:
        from monitoring.main import get_service as _get_monitoring_service  # type: ignore
        svc = _get_monitoring_service(MONITORING_CONFIG_PATH)
        totals = svc.aggregator.get_summary(date)
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(['employee_id','working_sec','idle_sec','away_sec','sleeping_sec'])
        for emp, stats in totals.items():
            writer.writerow([emp or '', int(stats.get('working_sec',0)), int(stats.get('idle_sec',0)), int(stats.get('away_sec',0)), int(stats.get('sleeping_sec',0))])
        data = buf.getvalue().encode('utf-8')
        from fastapi import Response
        return Response(content=data, media_type='text/csv', headers={'Content-Disposition': f'attachment; filename="summary_{(date or "today")}.csv"'})
    except Exception as ex:
        raise HTTPException(status_code=400, detail=f'Failed to export CSV: {ex}')

# Simple policy persistence using Preference model when DB is available
class PolicyOut(BaseModel):
    policy: Dict[str, Any]

@app.get('/monitoring/policy', response_model=PolicyOut)
async def get_monitoring_policy():
    try:
        if 'USE_DB' in globals() and USE_DB:
            from sqlalchemy import select
            from db import SessionLocal
            from models import Preference as PreferenceModel
            with SessionLocal() as db:
                row = db.execute(select(PreferenceModel).where(PreferenceModel.key == 'monitoring_policy')).scalars().first()
                if row and isinstance(row.value, dict):
                    return { 'policy': row.value }
        # fallback
        return { 'policy': IN_MEMORY_SETTINGS.get('monitoring_policy', {}) }
    except Exception as ex:
        raise HTTPException(status_code=400, detail=f'Failed to load policy: {ex}')

@app.post('/monitoring/policy', response_model=PolicyOut)
async def set_monitoring_policy(policy: Dict[str, Any]):
    try:
        if 'USE_DB' in globals() and USE_DB:
            from sqlalchemy import select
            from db import SessionLocal
            from models import Preference as PreferenceModel
            with SessionLocal() as db:
                row = db.execute(select(PreferenceModel).where(PreferenceModel.key == 'monitoring_policy')).scalars().first()
                if not row:
                    row = PreferenceModel(key='monitoring_policy', value=dict(policy))
                    db.add(row)
                else:
                    row.value = dict(policy)
                db.commit()
                return { 'policy': row.value }
        # fallback
        IN_MEMORY_SETTINGS['monitoring_policy'] = dict(policy)
        return { 'policy': IN_MEMORY_SETTINGS['monitoring_policy'] }
    except Exception as ex:
        raise HTTPException(status_code=400, detail=f'Failed to save policy: {ex}')

class AttendanceMarkRequest(BaseModel):
    # Accept either employee_id or id from frontend
    employee_id: str | None = Field(default=None)
    id: str | None = Field(default=None)
    status: str = 'present'
    method: str = 'ai'

class AttendanceRecordOut(BaseModel):
    id: Optional[str] = None
    employee_id: str
    date: str
    check_in_time: Optional[str] = None
    status: str
    marked_by: Optional[str] = None


class SystemLogOut(BaseModel):
    ts: str
    event_type: str
    description: str
    metadata: dict

IN_MEMORY_ATTENDANCE = []  # list of dicts (fallback if no DB)
IN_MEMORY_LOGS = []  # {ts, event_type, description, metadata}
IN_MEMORY_EMPLOYEES = []  # simple in-memory employee registry (legacy fallback if DB not present)
IN_MEMORY_SETTINGS = {
    'alert_email': 'admin@example.com',
    'updated_at': datetime.utcnow().isoformat(),
    'alert_cooldown_seconds': 60,
    'alert_bypass_levels': ['high', 'critical'],
    'last_alert_sent_at': None,
    'confidence_threshold': float(os.getenv('CONFIDENCE_THRESHOLD', '0.55')),  # 0-1 float
    'camera_assignments': {},     # e.g. { 'recognition': 'deviceId' }
}
LAST_ALERT_EMAIL_SENT_TS: float = 0.0  # epoch seconds for cooldown

EMPLOYEE_SEED = [
    { 'id': 'emp_1', 'employee_id': 'E001', 'full_name': 'Demo Employee 1', 'department': 'Engineering', 'status': 'active', 'photo_url': '', 'encoding_status': 'no-photo' },
    { 'id': 'emp_2', 'employee_id': 'E002', 'full_name': 'Demo Employee 2', 'department': 'Operations', 'status': 'active', 'photo_url': '', 'encoding_status': 'no-photo' },
    { 'id': 'emp_3', 'employee_id': 'E003', 'full_name': 'Demo Employee 3', 'department': 'HR', 'status': 'active', 'photo_url': '', 'encoding_status': 'no-photo' },
]

def log_event(event_type: str, description: str, metadata: dict | None = None):
    entry = {
        'ts': datetime.utcnow().isoformat(),
        'event_type': event_type,
        'description': description,
        'metadata': metadata or {}
    }
    IN_MEMORY_LOGS.append(entry)
    # Structured stdout emission
    try:
        _emit_json_log(event_type, description, **(metadata or {}))
    except Exception:
        pass
    if USE_DB:
        try:
            from models import SystemLog as SystemLogModel  # type: ignore
            with SessionLocal() as db:  # type: ignore
                db.add(SystemLogModel(event_type=event_type, description=description, meta=metadata or {}))
                db.commit()
        except Exception:
            pass

# ================= Email Utilities (CSV Attachment) =================
from email.message import EmailMessage

SMTP_HOST = os.getenv('SMTP_HOST', 'smtp.gmail.com')
SMTP_PORT = int(os.getenv('SMTP_PORT', '587'))
SMTP_USER = os.getenv('SMTP_USER')  # full Gmail address
SMTP_PASS = os.getenv('SMTP_PASS')  # app password (NOT your normal password)

# Intruder CSV builder removed

def _send_email_with_csv(recipient: str, subject: str, body: str, csv_bytes: bytes, csv_filename: str, snapshot_bytes: bytes | None = None, snapshot_subtype: str = 'png'):
    if not recipient:
        return
    if not (SMTP_USER and SMTP_PASS):
        # Missing SMTP credentials, skip silently (or could log)
        log_event('email.skip', 'Email skipped due to missing SMTP credentials', {'recipient': recipient})
        return
    try:
        msg = EmailMessage()
        msg['From'] = SMTP_USER
        msg['To'] = recipient
        msg['Subject'] = subject
        msg.set_content(body)
        msg.add_attachment(csv_bytes, maintype='text', subtype='csv', filename=csv_filename)
        if snapshot_bytes:
            msg.add_attachment(snapshot_bytes, maintype='image', subtype=snapshot_subtype, filename=f'snapshot.{snapshot_subtype}')
        context = ssl.create_default_context()
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls(context=context)
            server.login(SMTP_USER, SMTP_PASS)
            server.send_message(msg)
        log_event('email.sent', subject, {'recipient': recipient})
    except Exception as e:
        log_event('email.error', 'Failed to send email', {'error': str(e)})

# ================= Employees (In-Memory) =================
from uuid import uuid4
from fastapi import UploadFile, File, Form
from fastapi.responses import FileResponse
from pathlib import Path
import json

BASE_DIR = Path(__file__).parent
DATA_FILE = BASE_DIR / 'data_store.json'
UPLOAD_DIR = BASE_DIR / 'uploads'
UPLOAD_DIR.mkdir(exist_ok=True)

def _load_data():
    if DATA_FILE.exists():
        try:
            data = json.loads(DATA_FILE.read_text('utf-8'))
            IN_MEMORY_EMPLOYEES.extend(data.get('employees', []))
            IN_MEMORY_ATTENDANCE.extend(data.get('attendance', []))
            # intruder data removed
            IN_MEMORY_LOGS.extend(data.get('logs', []))
            settings = data.get('settings')
            if isinstance(settings, dict) and 'alert_email' in settings:
                IN_MEMORY_SETTINGS.update(settings)
        except Exception:
            pass

def _save_data():
    try:
        DATA_FILE.write_text(json.dumps({
            'employees': IN_MEMORY_EMPLOYEES,
            'attendance': IN_MEMORY_ATTENDANCE,
            # intruders removed
            'logs': IN_MEMORY_LOGS,
            'settings': IN_MEMORY_SETTINGS
        }, indent=2))
    except Exception:
        pass

# ===== Embedding Helpers (hash-based placeholder) =====
def _employee_photo_bytes(employee: dict) -> bytes | None:
    url = employee.get('photo_url')
    if not url:
        return None
    prefix = '/uploads/files/'
    if url.startswith(prefix):
        fname = url[len(prefix):]
        path = UPLOAD_DIR / fname
        if path.exists():
            try:
                return path.read_bytes()
            except Exception:
                return None
    return None

def _compute_embedding(data: bytes, dim: int = 64) -> list[float]:
    digest = hashlib.sha256(data).digest()
    buf = (digest * ((dim // len(digest)) + 1))[:dim]
    vec = [b / 255.0 for b in buf]
    norm = math.sqrt(sum(v*v for v in vec)) or 1.0
    return [round(v / norm, 6) for v in vec]

def _encode_employee(employee_id: str):
    if USE_DB:
        try:
            from sqlalchemy import select
            from models import Employee as EmployeeModel, Embedding as EmbeddingModel
            with SessionLocal() as db:
                row = db.execute(select(EmployeeModel).where(EmployeeModel.employee_id == employee_id)).scalars().first()
                if not row:
                    return
                if not row.photo_url:
                    row.embedding_status = 'no-photo'
                    db.commit()
                    return
                row.embedding_status = 'encoding'
                db.commit()
                # load bytes from uploads
                file_name = os.path.basename(row.photo_url) if row.photo_url else None
                bytes_data = None
                if file_name:
                    path = UPLOAD_DIR / file_name
                    if path.exists():
                        try:
                            bytes_data = path.read_bytes()
                        except Exception:
                            bytes_data = None
                if not bytes_data:
                    row.embedding_status = 'failed'
                    row.encoding_error = 'photo file missing'
                    db.commit()
                    return
                emb_res = compute_embedding_from_bytes(bytes_data) if 'compute_embedding_from_bytes' in globals() else None
                emb_vec = (emb_res.vector if emb_res else _compute_embedding(bytes_data))
                emb_model = getattr(emb_res, 'model', 'hash-v1') if emb_res else 'hash-v1'
                emb_dim = getattr(emb_res, 'dim', len(emb_vec)) if emb_res else len(emb_vec)
                # remove existing embedding
                db.query(EmbeddingModel).filter(EmbeddingModel.employee_id == row.id).delete()
                db.add(EmbeddingModel(employee_id=row.id, vector=json.dumps(emb_vec), model=emb_model, dim=emb_dim))
                row.embedding_status = 'ready'
                row.last_encoded_at = datetime.utcnow()
                row.encoding_error = None
                db.commit()
                log_event('employee.encode', f"Embedding generated for {employee_id}", {'employee_id': employee_id})
        except Exception as ex:  # DB path error
            log_event('employee.encode.error', f"DB embedding failed {employee_id}", {'error': str(ex)})
        return
    # Legacy in-memory fallback
    emp = next((e for e in IN_MEMORY_EMPLOYEES if e['employee_id'] == employee_id), None)
    if not emp:
        return
    if not emp.get('photo_url'):
        emp['encoding_status'] = 'no-photo'
        return
    try:
        emp['encoding_status'] = 'encoding'
        bytes_data = _employee_photo_bytes(emp)
        if not bytes_data:
            emp['encoding_status'] = 'failed'
            emp['encoding_error'] = 'photo file missing'
        else:
            emb = _compute_embedding(bytes_data)
            emp['embedding'] = emb
            emp['encoding_status'] = 'ready'
            emp['last_encoded_at'] = datetime.utcnow().isoformat()
            log_event('employee.encode', f"Embedding generated for {employee_id}", {'employee_id': employee_id})
    except Exception as ex:
        emp['encoding_status'] = 'failed'
        emp['encoding_error'] = str(ex)
        log_event('employee.encode.error', f"Embedding failed for {employee_id}", {'error': str(ex)})
    finally:
        _save_data()

EMBEDDING_QUEUE: asyncio.Queue[str] = asyncio.Queue()
EMBEDDING_WORKER_ALIVE = False

async def _embedding_worker():
    global EMBEDDING_WORKER_ALIVE
    EMBEDDING_WORKER_ALIVE = True
    log_event('embedding.worker.start', 'Embedding worker started', {})
    while True:
        try:
            emp_id = await EMBEDDING_QUEUE.get()
            _encode_employee(emp_id)
        except Exception as ex:
            log_event('embedding.worker.error', 'Unhandled worker exception', {'error': str(ex)})
        finally:
            EMBEDDING_QUEUE.task_done()
            # lightweight heartbeat metric
            if EMBEDDING_QUEUE.qsize() % 10 == 0:
                log_event('embedding.worker.heartbeat', 'Worker heartbeat', {'queue_size': EMBEDDING_QUEUE.qsize()})

def _ensure_embedding_worker():
    try:
        loop = asyncio.get_event_loop()
        # Only schedule once – mark by attribute
        if not any(getattr(t, 'get_name', lambda: '')() == 'embedding-worker' for t in asyncio.all_tasks(loop)):
            loop.create_task(_embedding_worker(), name='embedding-worker')
    except RuntimeError:
        # Event loop not started yet; worker will start on first enqueue under running loop
        pass

def _enqueue_embedding(employee_id: str):
    try:
        _ensure_embedding_worker()
        EMBEDDING_QUEUE.put_nowait(employee_id)
        log_event('embedding.queue', 'Queued embedding', {'employee_id': employee_id})
    except Exception as ex:
        log_event('embedding.queue.error', 'Failed to queue embedding', {'employee_id': employee_id, 'error': str(ex)})

# ================== DB-backed Employees (if SQLAlchemy available) ==================
USE_DB = False
try:
    from db import SessionLocal  # type: ignore
    from models import Employee as EmployeeModel, Embedding as EmbeddingModel  # type: ignore
    from sqlalchemy import select
    USE_DB = True
except Exception:
    USE_DB = False

def _employee_row_to_dict(row) -> dict:
    if not row:
        return {}
    base = {
        'id': row.id,
        'employee_id': row.employee_id,
        'full_name': row.full_name,
        'department': row.department,
        'position': row.position,
        'email': row.email,
        'phone': row.phone,
        'photo_url': row.photo_url,
        'status': row.status,
        'created_at': row.created_at.isoformat() if getattr(row, 'created_at', None) else None,
        'updated_at': row.updated_at.isoformat() if getattr(row, 'updated_at', None) else None,
        'encoding_status': row.embedding_status or ('no-photo' if not row.photo_url else 'pending'),
        'last_encoded_at': row.last_encoded_at.isoformat() if getattr(row, 'last_encoded_at', None) else None,
        'embedding': None,
    }
    # attempt to fetch embedding vector if present
    try:
        if hasattr(row, 'embedding_status') and row.embedding_status == 'ready':
            with SessionLocal() as db:
                emb = db.execute(select(EmbeddingModel).where(EmbeddingModel.employee_id == row.id)).scalars().first()
                if emb:
                    try:
                        base['embedding'] = json.loads(emb.vector) if emb.vector.startswith('[') else [float(x) for x in emb.vector.split()]  # type: ignore
                    except Exception:
                        base['embedding'] = None
    except Exception:
        pass
    return base

def _db_seed_employees_once():
    if not USE_DB:
        return
    with SessionLocal() as db:
        count = db.query(EmployeeModel).count()
        if count == 0:
            for e in EMPLOYEE_SEED:
                db.add(EmployeeModel(
                    id=e['id'],
                    employee_id=e['employee_id'],
                    full_name=e['full_name'],
                    department=e['department'],
                    status=e['status'],
                    photo_url=e.get('photo_url'),
                    embedding_status=e.get('encoding_status','no-photo')
                ))
            db.commit()

_db_seed_employees_once()

@app.post('/employees/{employee_id}/encode', dependencies=[Depends(require_roles('admin'))])
async def employees_manual_encode(employee_id: str):
    if USE_DB:
        from sqlalchemy import select
        with SessionLocal() as db:
            row = db.execute(select(EmployeeModel).where(EmployeeModel.employee_id == employee_id)).scalars().first()
            if not row:
                raise HTTPException(status_code=404, detail='Employee not found')
            # mark as pending/encoding
            row.embedding_status = 'encoding'
            db.commit()
        _enqueue_embedding(employee_id)
        return { 'queued': True, 'employee_id': employee_id }
    # legacy path
    emp = next((e for e in IN_MEMORY_EMPLOYEES if e['employee_id'] == employee_id), None)
    if not emp:
        raise HTTPException(status_code=404, detail='Employee not found (created set only)')
    _enqueue_embedding(employee_id)
    return { 'queued': True, 'employee_id': employee_id }
if ENABLE_RATE_LIMIT and limiter is not None:
    employees_manual_encode = limiter.limit(RATE_EMP_ENCODE)(employees_manual_encode)  # type: ignore

@app.post('/employees/encode_all', dependencies=[Depends(require_roles('admin'))])
async def employees_encode_all():
    """Queue embedding generation for all employees that have a photo.
    Useful after toggling REAL_FACE or changing model to refresh vectors.
    """
    queued = 0
    if USE_DB:
        from sqlalchemy import select
        with SessionLocal() as db:
            rows = db.execute(select(EmployeeModel)).scalars().all()
            for r in rows:
                if r.photo_url:
                    _enqueue_embedding(r.employee_id)
                    queued += 1
        return { 'queued': queued }
    # legacy
    for e in IN_MEMORY_EMPLOYEES:
        if e.get('photo_url'):
            _enqueue_embedding(e['employee_id'])
            queued += 1
    return { 'queued': queued }

_load_data()

class EmployeeCreate(BaseModel):
    employee_id: str
    full_name: str
    department: Optional[str] = None
    position: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    photo_url: Optional[str] = None
    status: str = 'active'

@app.get('/employees', dependencies=[Depends(get_current_user)])
async def employees_list():
    if USE_DB:
        from sqlalchemy import select
        with SessionLocal() as db:
            rows = db.execute(select(EmployeeModel)).scalars().all()
            return [_employee_row_to_dict(r) for r in rows]
    combined = { e['employee_id']: e for e in EMPLOYEE_SEED }
    for e in IN_MEMORY_EMPLOYEES:
        combined[e['employee_id']] = e
    return list(combined.values())

@app.post('/employees', dependencies=[Depends(require_roles('admin'))])
async def employees_create(request: Request, photo: UploadFile | None = File(None)):
    # Accept either JSON (signed upload flow) or multipart form (fallback)
    content_type = request.headers.get('content-type', '')
    if 'application/json' in content_type:
        data = await request.json()
        employee_id = data.get('employee_id')
        full_name = data.get('full_name')
        if not employee_id or not full_name:
            raise HTTPException(status_code=400, detail='employee_id and full_name required')
        emp = {
            'id': str(uuid4()),
            'employee_id': employee_id,
            'full_name': full_name,
            'department': data.get('department'),
            'position': data.get('position'),
            'email': data.get('email'),
            'phone': data.get('phone'),
            'photo_url': data.get('photo_url'),
            'status': 'active',
            'created_at': datetime.utcnow().isoformat()
        }
    else:
        form = await request.form()
        employee_id = form.get('employee_id')
        full_name = form.get('full_name')
        if not employee_id or not full_name:
            raise HTTPException(status_code=400, detail='employee_id and full_name required')
        upload_file = photo if photo else form.get('photo')
        photo_url = None
        if upload_file and hasattr(upload_file, 'filename'):
            # Save file
            file_bytes = await upload_file.read()
            dest = UPLOAD_DIR / f"{employee_id}.jpg"
            dest.write_bytes(file_bytes)
            photo_url = f"/uploads/files/{dest.name}"
        emp = {
            'id': str(uuid4()),
            'employee_id': employee_id,
            'full_name': full_name,
            'department': form.get('department'),
            'position': form.get('position'),
            'email': form.get('email'),
            'phone': form.get('phone'),
            'photo_url': photo_url,
            'status': 'active',
            'created_at': datetime.utcnow().isoformat()
        }
    # Add embedding metadata
    emp['encoding_status'] = 'pending' if emp.get('photo_url') else 'no-photo'
    emp['embedding'] = None
    emp['last_encoded_at'] = None
    if USE_DB:
        from sqlalchemy import select
        with SessionLocal() as db:
            existing = db.execute(select(EmployeeModel).where(EmployeeModel.employee_id == emp['employee_id'])).scalars().first()
            if existing:
                raise HTTPException(status_code=409, detail='employee_id already exists')
            row = EmployeeModel(
                employee_id=emp['employee_id'],
                full_name=emp['full_name'],
                department=emp.get('department'),
                position=emp.get('position'),
                email=emp.get('email'),
                phone=emp.get('phone'),
                photo_url=emp.get('photo_url'),
                status=emp.get('status','active'),
                embedding_status=emp['encoding_status']
            )
            db.add(row)
            db.commit()
            db.refresh(row)
        if emp.get('photo_url'):
            _enqueue_embedding(emp['employee_id'])
        log_event('employee.create', f"Employee created {emp['employee_id']}", {'employee_id': emp['employee_id']})
        return _employee_row_to_dict(row)
    # legacy fallback
    IN_MEMORY_EMPLOYEES.append(emp)
    log_event('employee.create', f"Employee created {emp['employee_id']}", {'employee_id': emp['employee_id']})
    if emp.get('photo_url'):
        _enqueue_embedding(emp['employee_id'])
    _save_data()
    return emp

@app.get('/employees/{employee_id}', dependencies=[Depends(get_current_user)])
async def employees_get(employee_id: str):
    if USE_DB:
        from sqlalchemy import select
        with SessionLocal() as db:
            row = db.execute(select(EmployeeModel).where(EmployeeModel.employee_id == employee_id)).scalars().first()
            if not row:
                raise HTTPException(status_code=404, detail='Employee not found')
            return _employee_row_to_dict(row)
    emp = next((e for e in IN_MEMORY_EMPLOYEES if e['employee_id'] == employee_id), None)
    if not emp:
        emp = next((e for e in EMPLOYEE_SEED if e['employee_id'] == employee_id), None)
    if not emp:
        raise HTTPException(status_code=404, detail='Employee not found')
    return emp

class EmployeeUpdate(BaseModel):
    full_name: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[str] = None
    photo_url: Optional[str] = None

@app.patch('/employees/{employee_id}', dependencies=[Depends(require_roles('admin'))])
async def employees_patch(employee_id: str, upd: EmployeeUpdate):
    if USE_DB:
        from sqlalchemy import select
        with SessionLocal() as db:
            row = db.execute(select(EmployeeModel).where(EmployeeModel.employee_id == employee_id)).scalars().first()
            if not row:
                raise HTTPException(status_code=404, detail='Employee not found')
            for k, v in upd.dict(exclude_unset=True).items():
                if v is not None:
                    if k == 'status':
                        row.status = v
                    elif k == 'full_name':
                        row.full_name = v
                    elif k == 'department':
                        row.department = v
                    elif k == 'position':
                        row.position = v
                    elif k == 'email':
                        row.email = v
                    elif k == 'phone':
                        row.phone = v
                    elif k == 'photo_url':
                        row.photo_url = v
            db.commit()
            db.refresh(row)
            log_event('employee.update', f'Employee updated {employee_id}', {'fields': list(upd.dict(exclude_unset=True).keys())})
            return _employee_row_to_dict(row)
    emp = next((e for e in IN_MEMORY_EMPLOYEES if e['employee_id'] == employee_id), None)
    if not emp:
        raise HTTPException(status_code=404, detail='Employee not found (only mutable after creation)')
    for k, v in upd.dict(exclude_unset=True).items():
        emp[k] = v
    log_event('employee.update', f'Employee updated {employee_id}', {'fields': list(upd.dict(exclude_unset=True).keys())})
    _save_data()
    return emp

@app.delete('/employees/{employee_id}', dependencies=[Depends(require_roles('admin'))])
async def employees_delete(employee_id: str):
    if USE_DB:
        from sqlalchemy import select
        with SessionLocal() as db:
            row = db.execute(select(EmployeeModel).where(EmployeeModel.employee_id == employee_id)).scalars().first()
            if not row:
                raise HTTPException(status_code=404, detail='Employee not found')
            db.delete(row)
            db.commit()
        log_event('employee.delete', f'Employee deleted {employee_id}', {'employee_id': employee_id})
        return { 'deleted': True, 'employee_id': employee_id }
    idx = next((i for i, e in enumerate(IN_MEMORY_EMPLOYEES) if e['employee_id'] == employee_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail='Employee not found (only deletable if created this session)')
    emp = IN_MEMORY_EMPLOYEES.pop(idx)
    log_event('employee.delete', f'Employee deleted {employee_id}', {'employee_id': employee_id})
    _save_data()
    return { 'deleted': True, 'employee_id': employee_id, 'id': emp['id'] }

class BulkImportResult(BaseModel):
    imported: int
    skipped: int

@app.post('/employees/bulk', response_model=BulkImportResult)
async def employees_bulk(file: UploadFile = File(...)):
    content = (await file.read()).decode('utf-8', errors='ignore')
    lines = [l.strip() for l in content.splitlines() if l.strip()]
    if not lines:
        return BulkImportResult(imported=0, skipped=0)
    # Assume header present if first line contains employee_id
    start = 1 if 'employee_id' in lines[0].lower() else 0
    imported = 0
    seen = { e['employee_id'] for e in IN_MEMORY_EMPLOYEES } | { e['employee_id'] for e in EMPLOYEE_SEED }
    for line in lines[start:]:
        cols = [c.strip() for c in line.split(',')]
        if len(cols) < 2: continue
        emp_id, full_name = cols[0], cols[1]
        if not emp_id or not full_name or emp_id in seen: continue
        emp = {
            'id': str(uuid4()),
            'employee_id': emp_id,
            'full_name': full_name,
            'department': cols[2] if len(cols) > 2 else None,
            'position': cols[3] if len(cols) > 3 else None,
            'email': cols[4] if len(cols) > 4 else None,
            'phone': cols[5] if len(cols) > 5 else None,
            'photo_url': None,
            'status': 'active',
            'created_at': datetime.utcnow().isoformat(),
            'encoding_status': 'no-photo',
            'embedding': None,
            'last_encoded_at': None
        }
        IN_MEMORY_EMPLOYEES.append(emp)
        seen.add(emp_id)
        imported += 1
    log_event('employee.bulk', f'Bulk import {imported} employees', {'imported': imported})
    _save_data()
    return BulkImportResult(imported=imported, skipped=0)

_UPLOAD_TOKENS: dict[str, str] = {}

@app.get('/uploads/sign')
async def uploads_sign(type: str, filename: str):  # simplistic stub
    token = str(uuid4())
    safe_name = filename.replace('..', '_')
    _UPLOAD_TOKENS[token] = safe_name
    # Return relative URLs the frontend will call against same origin
    return { 'upload_url': f'/uploads/put/{token}', 'public_url': f'/uploads/files/{safe_name}' }

@app.put('/uploads/put/{token}')
async def uploads_put(token: str, request: Request):
    filename = _UPLOAD_TOKENS.get(token)
    if not filename:
        raise HTTPException(status_code=404, detail='Invalid upload token')
    data = await request.body()
    dest = UPLOAD_DIR / filename
    dest.write_bytes(data)
    return { 'stored': True, 'filename': filename }

@app.get('/uploads/files/{filename}')
async def uploads_file(filename: str):
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail='File not found')
    return FileResponse(str(file_path))

@app.get('/attendance/today')
async def attendance_today():
    today = date.today().isoformat()
    if USE_DB:
        from sqlalchemy import select
        from models import Employee as EmployeeModel, AttendanceRecord as AttendanceRecordModel  # type: ignore
        enriched = []
        with SessionLocal() as db:  # type: ignore
            employees = db.execute(select(EmployeeModel)).scalars().all()
            emp_ids = [e.id for e in employees]
            if emp_ids:
                records = db.execute(select(AttendanceRecordModel).where(AttendanceRecordModel.date == today, AttendanceRecordModel.employee_id.in_(emp_ids))).scalars().all()
                rec_map = {r.employee_id: r for r in records}
            else:
                rec_map = {}
            for e in employees:
                rec = rec_map.get(e.id)
                attendance_payload = None
                if rec:
                    attendance_payload = {
                        'id': rec.id,
                        'employee_id': e.employee_id,
                        'date': rec.date,
                        'check_in_time': rec.check_in_time.isoformat() if rec.check_in_time else None,
                        'status': rec.status,
                        'marked_by': rec.marked_by
                    }
                enriched.append({
                    'id': e.id,
                    'employee_id': e.employee_id,
                    'full_name': e.full_name,
                    'department': e.department,
                    'status': e.status,
                    'attendance': attendance_payload
                })
        return { 'date': today, 'employees': enriched }
    # In-memory fallback
    enriched = []
    for emp in EMPLOYEE_SEED:
        record = next((r for r in IN_MEMORY_ATTENDANCE if r['employee_id'] == emp['id'] and r['date'] == today), None)
        enriched.append({ **emp, 'attendance': record })
    return { 'date': today, 'employees': enriched }

@app.post('/attendance/mark', response_model=AttendanceRecordOut)
async def attendance_mark(req: AttendanceMarkRequest):
    try:
        print('[attendance_mark] incoming', req.dict())
    except Exception:
        pass
    today = date.today().isoformat()
    eid = req.employee_id or req.id
    if not eid:
        raise HTTPException(status_code=400, detail='employee_id missing')
    if USE_DB:
        from sqlalchemy import select
        from models import Employee as EmployeeModel, AttendanceRecord as AttendanceRecordModel  # type: ignore
        with SessionLocal() as db:  # type: ignore
            emp_row = db.execute(select(EmployeeModel).where(EmployeeModel.employee_id == eid)).scalars().first()
            if not emp_row:
                raise HTTPException(status_code=404, detail='Employee not found')
            existing = db.execute(select(AttendanceRecordModel).where(AttendanceRecordModel.employee_id == emp_row.id, AttendanceRecordModel.date == today)).scalars().first()
            if existing:
                return AttendanceRecordOut(
                    id=existing.id,
                    employee_id=emp_row.employee_id,
                    date=existing.date,
                    check_in_time=existing.check_in_time.isoformat() if existing.check_in_time else None,
                    status=existing.status,
                    marked_by=existing.marked_by
                )
            rec = AttendanceRecordModel(
                employee_id=emp_row.id,
                date=today,
                check_in_time=datetime.utcnow(),
                status=req.status,
                marked_by=req.method
            )
            db.add(rec)
            db.commit()
            log_event('attendance', f'Attendance marked for {eid}', {'status': req.status, 'method': req.method})
            return AttendanceRecordOut(
                id=rec.id,
                employee_id=emp_row.employee_id,
                date=today,
                check_in_time=rec.check_in_time.isoformat() if rec.check_in_time else None,
                status=rec.status,
                marked_by=rec.marked_by
            )
    # In-memory fallback
    now = datetime.utcnow().isoformat()
    record = {
        'id': f"att_{len(IN_MEMORY_ATTENDANCE)+1}",
        'employee_id': eid,
        'date': today,
        'check_in_time': now,
        'status': req.status,
        'marked_by': req.method
    }
    if not any(r['employee_id'] == eid and r['date'] == today for r in IN_MEMORY_ATTENDANCE):
        IN_MEMORY_ATTENDANCE.append(record)
        log_event('attendance', f'Attendance marked for {eid}', {'status': req.status, 'method': req.method})
    return AttendanceRecordOut(**record)
if ENABLE_RATE_LIMIT and limiter is not None:
    attendance_mark = limiter.limit(RATE_ATTENDANCE)(attendance_mark)  # type: ignore

@app.get('/attendance/search')
async def attendance_search(
    page: int = 1,
    page_size: int = 50,
    employee_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    order: str = 'desc'
):
    """Search attendance with optional filters."""
    page = max(1, page)
    page_size = max(1, min(200, page_size))
    if USE_DB:
        from sqlalchemy import select, desc, asc, func
        from models import AttendanceRecord as AttendanceRecordModel, Employee as EmployeeModel  # type: ignore
        with SessionLocal() as db:  # type: ignore
            stmt = select(AttendanceRecordModel)
            emp_row = None
            if employee_id:
                emp_row = db.execute(select(EmployeeModel).where(EmployeeModel.employee_id == employee_id)).scalars().first()
                if not emp_row:
                    return { 'items': [], 'total': 0, 'page': page, 'page_size': page_size, 'has_more': False }
                stmt = stmt.where(AttendanceRecordModel.employee_id == emp_row.id)
            if date_from:
                stmt = stmt.where(AttendanceRecordModel.date >= date_from)
            if date_to:
                stmt = stmt.where(AttendanceRecordModel.date <= date_to)
            order_by = desc(AttendanceRecordModel.check_in_time) if order == 'desc' else asc(AttendanceRecordModel.check_in_time)
            total = db.execute(stmt.with_only_columns(func.count()).order_by(None)).scalar() or 0
            rows = db.execute(stmt.order_by(order_by).limit(page_size).offset((page-1)*page_size)).scalars().all()
            items = []
            for r in rows:
                emp = emp_row or db.execute(select(EmployeeModel).where(EmployeeModel.id == r.employee_id)).scalars().first()
                items.append({
                    'id': r.id,
                    'employee_id': emp.employee_id if emp else '',
                    'date': r.date,
                    'check_in_time': r.check_in_time.isoformat() if r.check_in_time else None,
                    'check_out_time': r.check_out_time.isoformat() if r.check_out_time else None,
                    'status': r.status,
                    'marked_by': r.marked_by
                })
            return { 'items': items, 'total': total, 'page': page, 'page_size': page_size, 'has_more': (page*page_size) < total }
    # in-memory
    items = [
        {
            'id': r['id'],
            'employee_id': r['employee_id'],
            'date': r['date'],
            'check_in_time': r.get('check_in_time'),
            'check_out_time': r.get('check_out_time'),
            'status': r.get('status','present'),
            'marked_by': r.get('marked_by')
        } for r in IN_MEMORY_ATTENDANCE
    ]
    return { 'items': items, 'total': len(items), 'page': 1, 'page_size': len(items), 'has_more': False }

class AttendanceUpdate(BaseModel):
    status: Optional[str] = None
    check_out: Optional[bool] = None

@app.patch('/attendance/{record_id}', response_model=AttendanceRecordOut, dependencies=[Depends(require_roles('admin'))])
async def attendance_patch(record_id: str, upd: AttendanceUpdate):
    if USE_DB:
        from sqlalchemy import select
        from models import AttendanceRecord as AttendanceRecordModel, Employee as EmployeeModel  # type: ignore
        with SessionLocal() as db:  # type: ignore
            row = db.execute(select(AttendanceRecordModel).where(AttendanceRecordModel.id == record_id)).scalars().first()
            if not row:
                raise HTTPException(status_code=404, detail='Attendance record not found')
            if upd.status:
                row.status = upd.status
            if upd.check_out:
                row.check_out_time = datetime.utcnow()
            db.commit(); db.refresh(row)
            emp = db.execute(select(EmployeeModel).where(EmployeeModel.id == row.employee_id)).scalars().first()
            return AttendanceRecordOut(
                id=row.id,
                employee_id=emp.employee_id if emp else '',
                date=row.date,
                check_in_time=row.check_in_time.isoformat() if row.check_in_time else None,
                status=row.status,
                marked_by=row.marked_by
            )
    for r in IN_MEMORY_ATTENDANCE:
        if r.get('id') == record_id:
            if upd.status: r['status'] = upd.status
            if upd.check_out: r['check_out_time'] = datetime.utcnow().isoformat()
            return AttendanceRecordOut(
                id=r['id'], employee_id=r['employee_id'], date=r['date'],
                check_in_time=r.get('check_in_time'), status=r.get('status','present'), marked_by=r.get('marked_by')
            )
    raise HTTPException(status_code=404, detail='Attendance record not found')

@app.post('/attendance/checkout', response_model=AttendanceRecordOut, dependencies=[Depends(require_roles('admin'))])
async def attendance_checkout(employee_id: str):
    if USE_DB:
        from sqlalchemy import select
        from models import AttendanceRecord as AttendanceRecordModel, Employee as EmployeeModel  # type: ignore
        with SessionLocal() as db:  # type: ignore
            emp = db.execute(select(EmployeeModel).where(EmployeeModel.employee_id == employee_id)).scalars().first()
            if not emp:
                raise HTTPException(status_code=404, detail='Employee not found')
            today = date.today().isoformat()
            row = db.execute(select(AttendanceRecordModel).where(AttendanceRecordModel.employee_id == emp.id, AttendanceRecordModel.date == today)).scalars().first()
            if not row:
                raise HTTPException(status_code=404, detail='No active record')
            row.check_out_time = datetime.utcnow()
            db.commit(); db.refresh(row)
            return AttendanceRecordOut(
                id=row.id,
                employee_id=employee_id,
                date=row.date,
                check_in_time=row.check_in_time.isoformat() if row.check_in_time else None,
                status=row.status,
                marked_by=row.marked_by
            )
    for r in IN_MEMORY_ATTENDANCE:
        if r.get('employee_id') == employee_id and r.get('date') == date.today().isoformat():
            r['check_out_time'] = datetime.utcnow().isoformat()
            return AttendanceRecordOut(
                id=r['id'], employee_id=r['employee_id'], date=r['date'], check_in_time=r.get('check_in_time'), status=r.get('status','present'), marked_by=r.get('marked_by')
            )
    raise HTTPException(status_code=404, detail='No active record')


@app.delete('/attendance/{record_id}', dependencies=[Depends(require_roles('admin'))])
async def attendance_delete(record_id: str):
    """Delete an attendance record (admin only)."""
    if USE_DB:
        from sqlalchemy import select
        from models import AttendanceRecord as AttendanceRecordModel  # type: ignore
        with SessionLocal() as db:  # type: ignore
            row = db.execute(select(AttendanceRecordModel).where(AttendanceRecordModel.id == record_id)).scalars().first()
            if not row:
                raise HTTPException(status_code=404, detail='Attendance record not found')
            db.delete(row)
            db.commit()
        log_event('attendance.delete', 'Attendance record deleted', {'record_id': record_id})
        return { 'deleted': True, 'id': record_id }
    idx = next((i for i, r in enumerate(IN_MEMORY_ATTENDANCE) if r.get('id') == record_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail='Attendance record not found')
    IN_MEMORY_ATTENDANCE.pop(idx)
    log_event('attendance.delete', 'Attendance record deleted', {'record_id': record_id})
    return { 'deleted': True, 'id': record_id }

# Intruder endpoints removed

@app.get('/logs', response_model=List[SystemLogOut])
async def logs(
    event_type: Optional[str] = None,
    limit: int = 200,
    since: Optional[str] = None,
    search: Optional[str] = None
):
    """Return recent system logs with optional filters.

    Query Parameters:
      - event_type: filter by exact event_type value.
      - limit: max number of entries (capped at 500).
      - since: ISO8601 timestamp; only logs with ts >= since are returned.
      - search: substring filter applied (case-insensitive) to description.
    """
    limit = max(1, min(500, limit))
    since_dt: Optional[datetime] = None
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace('Z',''))
        except Exception:
            raise HTTPException(status_code=400, detail='Invalid since timestamp')

    def _match(entry: Dict[str, Any]):
        if event_type and entry.get('event_type') != event_type:
            return False
        if since_dt:
            ts = entry.get('ts')
            if ts:
                try:
                    dt = datetime.fromisoformat(ts.replace('Z',''))
                    if dt < since_dt:
                        return False
                except Exception:
                    return False
        if search:
            desc = (entry.get('description') or '').lower()
            if search.lower() not in desc:
                return False
        return True

    if USE_DB:
        try:
            from sqlalchemy import select, desc
            from models import SystemLog as SystemLogModel  # type: ignore
            with SessionLocal() as db:  # type: ignore
                q = select(SystemLogModel).order_by(desc(SystemLogModel.created_at)).limit(limit * 3)
                rows = db.execute(q).scalars().all()
                out: List[SystemLogOut] = []
                for r in rows:
                    md = getattr(r, 'meta', None) or {}
                    entry = {
                        'ts': r.created_at.isoformat() if r.created_at else None,
                        'event_type': r.event_type,
                        'description': r.description,
                        'metadata': md
                    }
                    if _match(entry):
                        out.append(SystemLogOut(**entry))
                        if len(out) >= limit:
                            break
                return out
        except Exception as ex:
            log_event('logs.error', 'Failed to fetch DB logs', {'error': str(ex)})
    # in-memory fallback
    data = list(reversed(IN_MEMORY_LOGS[-(limit*3):]))
    filtered: List[SystemLogOut] = []
    for e in data:
        if _match(e):
            filtered.append(SystemLogOut(ts=e.get('ts'), event_type=e.get('event_type'), description=e.get('description'), metadata=e.get('metadata', {})))
            if len(filtered) >= limit:
                break
    return filtered

class LogCreate(BaseModel):
    event_type: str
    description: str
    metadata: Optional[Dict[str, Any]] = None

@app.post('/logs', status_code=201)
async def logs_create(body: LogCreate):
    """Create a log entry (backend write endpoint)."""
    try:
        log_event(body.event_type, body.description, body.metadata)
        return { 'status': 'ok' }
    except Exception as ex:
        raise HTTPException(status_code=500, detail=f'Unable to record log: {ex}')

# Intruder resolve endpoint removed

# ================= Settings (Email Alerts) =================
class EmailSettings(BaseModel):
    alert_email: str
    updated_at: str | None = None
    enabled: bool = True
    alert_cooldown_seconds: int
    alert_bypass_levels: List[str]

@app.get('/settings/email', response_model=EmailSettings)
async def get_email_settings():
    IN_MEMORY_SETTINGS.setdefault('alert_cooldown_seconds', 60)
    IN_MEMORY_SETTINGS.setdefault('alert_bypass_levels', ['high', 'critical'])
    return EmailSettings(
        alert_email=IN_MEMORY_SETTINGS.get('alert_email', ''),
        updated_at=IN_MEMORY_SETTINGS.get('updated_at'),
        enabled=bool(IN_MEMORY_SETTINGS.get('alert_email')),
        alert_cooldown_seconds=IN_MEMORY_SETTINGS.get('alert_cooldown_seconds', 60),
        alert_bypass_levels=IN_MEMORY_SETTINGS.get('alert_bypass_levels', ['high','critical'])
    )

class EmailSettingsUpdate(BaseModel):
    alert_email: Optional[str] = None
    alert_cooldown_seconds: Optional[int] = None
    alert_bypass_levels: Optional[List[str]] = None

class AppPreferences(BaseModel):
    confidence_threshold: float
    camera_assignments: dict

class AppPreferencesUpdate(BaseModel):
    confidence_threshold: Optional[float] = None
    camera_assignments: Optional[dict] = None

@app.put('/settings/email', response_model=EmailSettings)
async def update_email_settings(payload: EmailSettingsUpdate):
    changed = False
    if payload.alert_email is not None:
        email = payload.alert_email.strip()
        if email:
            if '@' not in email or '.' not in email.split('@')[-1]:
                raise HTTPException(status_code=400, detail='Invalid email address')
        IN_MEMORY_SETTINGS['alert_email'] = email
        changed = True
        log_event('settings', 'Alert email updated', {'alert_email': email})
    if payload.alert_cooldown_seconds is not None:
        if payload.alert_cooldown_seconds < 0 or payload.alert_cooldown_seconds > 3600:
            raise HTTPException(status_code=400, detail='alert_cooldown_seconds must be between 0 and 3600')
        IN_MEMORY_SETTINGS['alert_cooldown_seconds'] = payload.alert_cooldown_seconds
        changed = True
        log_event('settings', 'Alert cooldown updated', {'cooldown_seconds': payload.alert_cooldown_seconds})
    if payload.alert_bypass_levels is not None:
        allowed = {'low','medium','high','critical'}
        levels = [l.lower() for l in payload.alert_bypass_levels if l and l.lower() in allowed]
        if not levels:
            raise HTTPException(status_code=400, detail='alert_bypass_levels must include at least one valid level')
        IN_MEMORY_SETTINGS['alert_bypass_levels'] = levels
        changed = True
        log_event('settings', 'Alert bypass levels updated', {'levels': levels})
    if changed:
        IN_MEMORY_SETTINGS['updated_at'] = datetime.utcnow().isoformat()
        _save_data()
    return await get_email_settings()

@app.get('/settings/app', response_model=AppPreferences)
async def get_app_preferences():
    return AppPreferences(
        confidence_threshold=IN_MEMORY_SETTINGS.get('confidence_threshold', 0.55),
        camera_assignments=IN_MEMORY_SETTINGS.get('camera_assignments', {})
    )

@app.put('/settings/app', response_model=AppPreferences)
async def update_app_preferences(upd: AppPreferencesUpdate):
    changed = False
    if upd.confidence_threshold is not None:
        if upd.confidence_threshold < 0 or upd.confidence_threshold > 1:
            raise HTTPException(status_code=400, detail='confidence_threshold must be between 0 and 1')
        IN_MEMORY_SETTINGS['confidence_threshold'] = float(upd.confidence_threshold)
        changed = True
    if upd.camera_assignments is not None:
        if not isinstance(upd.camera_assignments, dict):
            raise HTTPException(status_code=400, detail='camera_assignments must be an object')
        IN_MEMORY_SETTINGS['camera_assignments'] = upd.camera_assignments
        changed = True
    if changed:
        IN_MEMORY_SETTINGS['updated_at'] = datetime.utcnow().isoformat()
        _save_data()
        log_event('settings', 'App preferences updated', {})
    return await get_app_preferences()

@app.post('/settings/email/test')
async def test_email(background_tasks: BackgroundTasks):
    """Send a test alert email using current settings (no cooldown)."""
    recipient = IN_MEMORY_SETTINGS.get('alert_email', '')
    if not recipient:
        raise HTTPException(status_code=400, detail='No alert_email configured')
    # Send a lightweight test email without attachments
    subject = 'Test Email (Configuration Check)'
    body = 'This is a test notification to verify your email configuration.'
    background_tasks.add_task(_send_email_with_csv, recipient, subject, body, b'id,message\n1,ok\n', 'test.csv', None, 'png')
    IN_MEMORY_SETTINGS['last_alert_sent_at'] = datetime.utcnow().isoformat()
    _save_data()
    log_event('email.test', 'Test email queued', {'recipient': recipient})
    return { 'sent': True, 'recipient': recipient }

@app.get('/settings/email/status')
async def email_status():
    cooldown = IN_MEMORY_SETTINGS.get('alert_cooldown_seconds', 60)
    last_sent = IN_MEMORY_SETTINGS.get('last_alert_sent_at')
    now_iso = datetime.utcnow().isoformat()
    next_allowed = None
    seconds_until_next = 0
    if cooldown and cooldown > 0 and last_sent:
        try:
            last_dt = datetime.fromisoformat(last_sent.replace('Z',''))
            from datetime import timedelta
            na = last_dt + timedelta(seconds=cooldown)
            next_allowed = na.isoformat()
            diff = (na - datetime.utcnow()).total_seconds()
            seconds_until_next = int(diff) if diff > 0 else 0
        except Exception:
            pass
    return {
        'alert_email': IN_MEMORY_SETTINGS.get('alert_email',''),
        'cooldown_seconds': cooldown,
        'bypass_levels': IN_MEMORY_SETTINGS.get('alert_bypass_levels', ['high','critical']),
        'last_alert_sent_at': last_sent,
        'server_time': now_iso,
        'next_allowed_at': next_allowed,
        'seconds_until_next': seconds_until_next
    }

# ================= System Info & Model Management =================
@app.get('/system/status')
async def system_status():
    # Lightweight pseudo stats; in real impl integrate psutil, GPU libs, etc.
    cpu = None
    mem = None
    try:  # best-effort system metrics
        import importlib
        psutil_spec = importlib.util.find_spec('psutil')
        if psutil_spec:
            import psutil  # type: ignore
            cpu = psutil.cpu_percent(interval=0.1)
            mem = psutil.virtual_memory()._asdict()
    except Exception:
        pass
    return {
        'cpu_percent': cpu,
        'memory': mem,
        'model_ready': True,
        'confidence_threshold': IN_MEMORY_SETTINGS.get('confidence_threshold', 0.55)
    }

@app.get('/system/face')
async def system_face():
    """Detailed face pipeline diagnostics (optional model)."""
    try:
        return insightface_status()
    except Exception as ex:
        return {'enabled': False, 'model_name': 'hash-v1', 'loaded': False, 'error': str(ex)}

class RetrainRequest(BaseModel):
    force: bool = False

@app.post('/system/retrain')
async def system_retrain(req: RetrainRequest, background_tasks: BackgroundTasks):
    # Recompute embeddings for all employees with photos
    def _retrain_job():
        rebuilt = 0
        for emp in IN_MEMORY_EMPLOYEES:
            if emp.get('photo_url'):
                try:
                    bytes_data = _employee_photo_bytes(emp)
                    if not bytes_data:
                        emp['encoding_status'] = 'failed'
                        emp['encoding_error'] = 'photo missing'
                        continue
                    emp['embedding'] = _compute_embedding(bytes_data)
                    emp['encoding_status'] = 'ready'
                    emp['last_encoded_at'] = datetime.utcnow().isoformat()
                    rebuilt += 1
                except Exception as ex:
                    emp['encoding_status'] = 'failed'
                    emp['encoding_error'] = str(ex)
        _save_data()
        log_event('model.retrain', 'Model encodings retrained', {'force': req.force, 'rebuilt': rebuilt})
    background_tasks.add_task(_retrain_job)
    return { 'queued': True, 'force': req.force }

