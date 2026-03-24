from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

"""Authentication tests.

Seed behavior:
 - ADMIN_USERNAME / ADMIN_PASSWORD (defaults admin/password)
 - DEMO_USER / DEMO_PASS (defaults admin/demo123) may overlap username
 - SECOND_ADMIN / SECOND_ADMIN_PASS (defaults Pranav/Pranav)

Depending on env vars, the primary admin may have 'password' or 'demo123'.
Tests attempt both to remain resilient across environments.
"""

def _login(username: str, password: str):
    return client.post('/auth/login', json={'username': username, 'password': password})

def test_login_success_any_seed():
    # Try common seeded combinations; accept first that works
    candidates = [
        ('admin', 'password'),
        ('admin', 'demo123'),
        ('Pranav', 'Pranav'),
    ]
    success = None
    for u, p in candidates:
        resp = _login(u, p)
        if resp.status_code == 200:
            success = resp
            break
    assert success is not None, 'No seeded credential worked'
    body = success.json()
    assert 'access_token' in body
    assert body['user']['username'] in {'admin', 'Pranav'}

def test_login_failure():
    r = _login('admin', 'wrongpw')
    assert r.status_code == 401
    assert 'Invalid credentials' in r.text
