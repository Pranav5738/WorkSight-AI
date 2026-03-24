"""Seed development database with sample data.

Usage (Windows PowerShell):
  cd Backend
  .\.venv\Scripts\python scripts/seed_dev.py
"""
from __future__ import annotations

from sqlalchemy import select
from db import SessionLocal, Base, engine
from models import Employee, Embedding, Preference
from monitoring.aggregator import ProductivityAggregator
from face_pipeline import compute_embedding_from_bytes


def seed():
    try:
        Base.metadata.create_all(bind=engine)
    except Exception:
        pass
    created = []
    with SessionLocal() as db:
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
            vec = compute_embedding_from_bytes(d['employee_id'].encode('utf-8')).vector
            db.add(Embedding(employee_id=r.id, vector=' '.join(str(x) for x in vec), model='hash-v1', dim=len(vec)))
            created.append(d['employee_id'])
        pref = db.execute(select(Preference).where(Preference.key=='monitoring_policy')).scalars().first()
        if not pref:
            p = Preference(key='monitoring_policy', value={ 'idle_minutes': 30, 'idle_deduction': 50, 'away_minutes': 15, 'away_deduction': 25 })
            db.add(p)
        db.commit()
    # productivity sums
    agg = ProductivityAggregator(use_db=True)
    for i, emp in enumerate(['E001','E002','E003']):
        agg.add_seconds(employee_id=emp, state='working', seconds=120 + i*30)
        agg.add_seconds(employee_id=emp, state='idle', seconds=60 + i*10)
        agg.add_seconds(employee_id=emp, state='away', seconds=20)
    return created


if __name__ == '__main__':
    created = seed()
    print('Seeded:', created)
