# Backend Dockerfile
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

# System deps for psycopg2/opencv minimal (libmagic etc if needed later)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY Backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy only backend code
COPY Backend /app

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
