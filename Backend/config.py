"""Centralized configuration for the Cortexa backend.

Reads environment variables once; exposes strongly-typed-ish constants.
Intentionally lightweight to avoid heavy dependency on pydantic settings yet.
"""
from __future__ import annotations
import os

APP_NAME = os.getenv('APP_NAME', 'Cortexa Vision Backend')
APP_VERSION = os.getenv('APP_VERSION', '0.3.0')
JWT_SECRET = os.getenv('JWT_SECRET', 'dev-insecure-secret-change')
ACCESS_EXPIRE_SECONDS = int(os.getenv('ACCESS_EXPIRE_SECONDS', '900'))
REFRESH_EXPIRE_SECONDS = int(os.getenv('REFRESH_EXPIRE_SECONDS', '604800'))
CONFIDENCE_THRESHOLD_DEFAULT = float(os.getenv('CONFIDENCE_THRESHOLD', '0.9'))
EMBEDDING_DIM = int(os.getenv('EMBEDDING_DIM', '64'))
ENABLE_PROMETHEUS = os.getenv('ENABLE_PROMETHEUS', '1') == '1'
RATE_LIMIT_GENERAL = os.getenv('RATE_LIMIT_GENERAL', '100/minute')
RATE_LIMIT_LOGIN = os.getenv('RATE_LIMIT_LOGIN', '10/minute')
ALLOW_ORIGINS = [o.strip() for o in os.getenv('CORS_ORIGINS', 'http://localhost:5173;http://127.0.0.1:5173').split(';') if o.strip()]
# Allow regex for origins (useful in dev when Vite chooses a new port). Starlette's CORSMiddleware
# supports allow_origin_regex. Default permits http(s)://localhost:<any> and http(s)://127.0.0.1:<any>
ALLOW_ORIGIN_REGEX = os.getenv('CORS_ORIGIN_REGEX', r'^https?://(localhost|127\.0\.0\.1)(:\d+)?$')
REQUEST_ID_HEADER = os.getenv('REQUEST_ID_HEADER', 'X-Request-ID')

__all__ = [k for k in globals().keys() if k.isupper()]