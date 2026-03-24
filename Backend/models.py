from sqlalchemy import Column, String, DateTime, Boolean, Text, JSON, ForeignKey, Integer, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid, datetime as dt
from db import Base

# Helper for UUID primary keys portable across SQLite/Postgres

def _uuid():
    return str(uuid.uuid4())

class Employee(Base):
    __tablename__ = 'employees'
    id = Column(String, primary_key=True, default=_uuid)
    employee_id = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    department = Column(String)
    position = Column(String)
    email = Column(String, index=True)
    phone = Column(String)
    photo_url = Column(Text)
    status = Column(String, default='active')
    created_at = Column(DateTime, default=dt.datetime.utcnow)
    updated_at = Column(DateTime, default=dt.datetime.utcnow, onupdate=dt.datetime.utcnow)
    # Embedding linkage
    embedding_status = Column(String, default='pending')  # pending|ready|error|no-photo
    last_encoded_at = Column(DateTime)
    encoding_error = Column(Text)

class Embedding(Base):
    __tablename__ = 'embeddings'
    id = Column(String, primary_key=True, default=_uuid)
    employee_id = Column(String, ForeignKey('employees.id', ondelete='CASCADE'), index=True, nullable=False)
    vector = Column(Text, nullable=False)  # store as JSON string or space separated floats for now
    model = Column(String, nullable=False)
    dim = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=dt.datetime.utcnow)

class AttendanceRecord(Base):
    __tablename__ = 'attendance_records'
    id = Column(String, primary_key=True, default=_uuid)
    employee_id = Column(String, ForeignKey('employees.id', ondelete='CASCADE'), index=True)
    date = Column(String, index=True)  # ISO date string
    check_in_time = Column(DateTime)
    check_out_time = Column(DateTime)
    status = Column(String, default='absent')
    marked_by = Column(String)
    notes = Column(Text)
    created_at = Column(DateTime, default=dt.datetime.utcnow)


class SystemLog(Base):
    __tablename__ = 'system_logs'
    id = Column(String, primary_key=True, default=_uuid)
    event_type = Column(String, index=True)
    description = Column(Text)
    # 'metadata' is a reserved attribute name in SQLAlchemy declarative; use 'meta' attribute while
    # keeping the underlying column name for clarity / backwards compatibility if a partial table existed.
    meta = Column('metadata', JSON)
    created_at = Column(DateTime, default=dt.datetime.utcnow, index=True)

class Preference(Base):
    __tablename__ = 'preferences'
    id = Column(String, primary_key=True, default=_uuid)
    key = Column(String, unique=True, index=True)
    value = Column(JSON)
    created_at = Column(DateTime, default=dt.datetime.utcnow)
    updated_at = Column(DateTime, default=dt.datetime.utcnow, onupdate=dt.datetime.utcnow)


class ProductivityDaily(Base):
    __tablename__ = 'productivity_daily'
    id = Column(String, primary_key=True, default=_uuid)
    employee_id = Column(String, ForeignKey('employees.id', ondelete='SET NULL'), index=True, nullable=True)
    date = Column(String, index=True)  # ISO date YYYY-MM-DD
    working_sec = Column(Integer, default=0)
    idle_sec = Column(Integer, default=0)
    away_sec = Column(Integer, default=0)
    sleeping_sec = Column(Integer, default=0)
    created_at = Column(DateTime, default=dt.datetime.utcnow)
    updated_at = Column(DateTime, default=dt.datetime.utcnow, onupdate=dt.datetime.utcnow)
    __table_args__ = (
        Index('ix_productivity_unique_per_day', 'employee_id', 'date', unique=False),
    )
