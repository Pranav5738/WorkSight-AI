from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_healthz():
    r = client.get('/healthz')
    assert r.status_code == 200
    data = r.json()
    assert data.get('ok') is True

