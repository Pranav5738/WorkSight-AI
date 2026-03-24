import os, time, uuid, re
from typing import Optional, List, Dict

# Attempt to import python-jose; provide minimal HS256 fallback if missing.
try:  # pragma: no cover - runtime environment dependent
    from jose import jwt, JWTError  # type: ignore
except Exception:  # Fallback lightweight implementation (NOT full spec compliant)
    import json, hmac, hashlib, base64
    class JWTError(Exception):
        pass
    def _b64url(data: bytes) -> bytes:
        return base64.urlsafe_b64encode(data).rstrip(b'=')
    def _b64url_decode(seg: str) -> bytes:
        pad = '=' * (-len(seg) % 4)
        return base64.urlsafe_b64decode(seg + pad)
    class _MiniJWT:
        @staticmethod
        def encode(claims: dict, key: str, algorithm: str = 'HS256') -> str:
            header = {'alg': 'HS256', 'typ': 'JWT'}
            header_b = _b64url(json.dumps(header, separators=(',',':')).encode())
            payload_b = _b64url(json.dumps(claims, separators=(',',':')).encode())
            signing_input = header_b + b'.' + payload_b
            sig = hmac.new(key.encode(), signing_input, hashlib.sha256).digest()
            token = signing_input + b'.' + _b64url(sig)
            return token.decode()
        @staticmethod
        def decode(token: str, key: str, algorithms=None) -> dict:
            try:
                header_b, payload_b, sig_b = token.split('.')
            except ValueError:
                raise JWTError('invalid token format')
            signing_input = (header_b + '.' + payload_b).encode()
            sig = _b64url_decode(sig_b)
            expected = hmac.new(key.encode(), signing_input, hashlib.sha256).digest()
            if not hmac.compare_digest(sig, expected):
                raise JWTError('signature mismatch')
            payload = json.loads(_b64url_decode(payload_b))
            if 'exp' in payload and int(time.time()) > int(payload['exp']):
                raise JWTError('token expired')
            return payload
    jwt = _MiniJWT()
    print('[auth] WARNING: python-jose not installed; using minimal JWT fallback (install python-jose for full support)')
from passlib.context import CryptContext
from pydantic import BaseModel

SECRET_KEY = os.getenv('JWT_SECRET', 'dev-insecure-secret-change')
ALGORITHM = 'HS256'
ACCESS_EXPIRE_SECONDS = int(os.getenv('ACCESS_EXPIRE_SECONDS', '900'))  # 15m default
REFRESH_EXPIRE_SECONDS = int(os.getenv('REFRESH_EXPIRE_SECONDS', '604800'))  # 7d

# Password hashing strategy:
# Removed bcrypt due to broken environment causing noisy startup warnings.
# Using pbkdf2_sha256 only (widely supported, memory-light, configurable) for stability.
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

class UserRecord(BaseModel):
    username: str
    password_hash: str
    roles: List[str]
    disabled: bool = False

# Simple user store (can be replaced by DB later)
_USERS: Dict[str, UserRecord] = {}
# When two seeded env vars point to the same username (e.g. admin/password and admin/demo123)
# we allow an alternate password for convenience. Store additional password hashes here.
_ALT_HASHES: Dict[str, List[str]] = {}
_FAILED_ATTEMPTS: Dict[str, int] = {}
_LOCKED_UNTIL: Dict[str, int] = {}
MAX_FAILED = int(os.getenv('AUTH_MAX_FAILED', '5'))
LOCKOUT_SECONDS = int(os.getenv('AUTH_LOCKOUT_SECONDS', '900'))  # 15m
_DEFAULT_ADMIN = os.getenv('ADMIN_USERNAME', '123')
_DEFAULT_PASS = os.getenv('ADMIN_PASSWORD', '123')
_DEMO_USER = os.getenv('DEMO_USER')  # deprecated; no longer seeded
_DEMO_PASS = os.getenv('DEMO_PASS')
_SECOND_ADMIN = os.getenv('SECOND_ADMIN')  # deprecated; no longer seeded
_SECOND_PASS = os.getenv('SECOND_ADMIN_PASS')
_AUTH_COMPAT = os.getenv('AUTH_COMPAT_ALLOW_LEGACY', '1') == '1'

def _force_add_user(username: str, password: str, roles: list[str]):
    # Bypass complexity for seeded users; only for initial bootstrap.
    try:
        hashed = pwd_context.hash(password[:128])
    except Exception:
        hashed = '!invalid-seed-hash!'
    _USERS[username] = UserRecord(username=username, password_hash=hashed, roles=roles)

# Seed only the single default admin user
if _DEFAULT_ADMIN not in _USERS:
    _force_add_user(_DEFAULT_ADMIN, _DEFAULT_PASS, ['admin'])

# Ensure legacy envs do not implicitly add more users. If legacy envs set an
# alternate password for the same default admin username, register it as an
# optional alternate hash so either password works, but do not create extra users.
if _DEMO_USER and _DEMO_USER == _DEFAULT_ADMIN and _DEMO_PASS and _DEMO_PASS != _DEFAULT_PASS:
    try:
        alt_hash = pwd_context.hash(_DEMO_PASS[:128])
        _ALT_HASHES.setdefault(_DEMO_USER, []).append(alt_hash)
    except Exception:
        pass

PASSWORD_REGEX = re.compile(r'^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,}$')

def password_valid(plain: str) -> bool:
    return bool(PASSWORD_REGEX.match(plain))

def verify_password(plain: str, hashed: str) -> bool:
    if not hashed or hashed.startswith('!invalid'):
        return False
    try:
        return pwd_context.verify(plain, hashed)
    except Exception:
        return False

def authenticate_user(username: str, password: str) -> Optional[UserRecord]:
    now = int(time.time())
    if username in _LOCKED_UNTIL and _LOCKED_UNTIL[username] > now:
        return None
    user = _USERS.get(username)
    legacy_ok = False
    if not user or user.disabled:
        # Backwards-compat: allow legacy demo credentials mapping to the default admin
        if _AUTH_COMPAT:
            legacy_users = {
                'admin': ['password', 'demo123'],
                'Pranav': ['Pranav']
            }
            if username in legacy_users and password in legacy_users[username]:
                mapped = _USERS.get(_DEFAULT_ADMIN)
                if mapped and not mapped.disabled:
                    # Return a copy with alias username so downstream sees expected principal
                    return UserRecord(username=username, password_hash=mapped.password_hash, roles=mapped.roles, disabled=False)
                else:
                    return None
            else:
                return None
        else:
            return None
    if not verify_password(password, user.password_hash):
        # Try any alternate hashes registered for this user (e.g., dual seeded admin password)
        alt_list = _ALT_HASHES.get(username, [])
        matched_alt = False
        for h in alt_list:
            try:
                if pwd_context.verify(password, h):
                    matched_alt = True
                    break
            except Exception:
                continue
        if not matched_alt:
            _FAILED_ATTEMPTS[username] = _FAILED_ATTEMPTS.get(username, 0) + 1
            if _FAILED_ATTEMPTS[username] >= MAX_FAILED:
                _LOCKED_UNTIL[username] = now + LOCKOUT_SECONDS
            return None
    # success resets counters
    if username in _FAILED_ATTEMPTS:
        _FAILED_ATTEMPTS.pop(username, None)
    _LOCKED_UNTIL.pop(username, None)
    return user

def _build_claims(user: UserRecord, token_type: str, exp_seconds: int):
    now = int(time.time())
    return {
        'sub': user.username,
        'roles': user.roles,
        'typ': token_type,
        'iat': now,
        'exp': now + exp_seconds,
        'jti': str(uuid.uuid4())
    }

def issue_tokens(user: UserRecord):
    access_claims = _build_claims(user, 'access', ACCESS_EXPIRE_SECONDS)
    refresh_claims = _build_claims(user, 'refresh', REFRESH_EXPIRE_SECONDS)
    access = jwt.encode(access_claims, SECRET_KEY, algorithm=ALGORITHM)
    refresh = jwt.encode(refresh_claims, SECRET_KEY, algorithm=ALGORITHM)
    return {
        'access_token': access,
        'refresh_token': refresh,
        'expires_in': ACCESS_EXPIRE_SECONDS,
        'user': { 'username': user.username, 'roles': user.roles }
    }

class TokenData(BaseModel):
    username: str
    roles: List[str]
    token_type: str

def decode_token(token: str) -> Optional[TokenData]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return TokenData(username=payload.get('sub'), roles=payload.get('roles', []), token_type=payload.get('typ','access'))
    except JWTError:
        return None

def create_user(username: str, password: str, roles: Optional[List[str]] = None, disabled: bool = False) -> UserRecord:
    if username in _USERS:
        raise ValueError('User already exists')
    if not password_valid(password):
        raise ValueError('Password does not meet complexity requirements')
    sanitized = password[:128]
    hashed = pwd_context.hash(sanitized)
    rec = UserRecord(username=username, password_hash=hashed, roles=roles or ['user'], disabled=disabled)
    _USERS[username] = rec
    return rec

def list_users() -> List[str]:
    return list(_USERS.keys())

