import pytest
from fastapi.testclient import TestClient
from main import app, log_event

client = TestClient(app)

def test_logs_basic():
    log_event('test.event', 'Unit test log entry', {'k':'v'})
    r = client.get('/logs?event_type=test.event&limit=5')
    assert r.status_code == 200
    data = r.json()
    assert any(e['event_type'] == 'test.event' for e in data)


def test_logs_search_and_since():
    log_event('test.search', 'Searchable FooBarEntry', {})
    r_all = client.get('/logs?search=foobarentry&limit=20')
    assert r_all.status_code == 200
    assert any('FooBarEntry' in e['description'] for e in r_all.json())
