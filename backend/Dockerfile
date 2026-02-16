FROM python:3.12-slim

WORKDIR /app

# System deps for Pillow image processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg62-turbo-dev libwebp-dev zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast dependency resolution
RUN pip install uv

# Copy all source first, then install
COPY pyproject.toml .
COPY app/ app/
COPY alembic.ini .
COPY alembic/ alembic/

RUN uv pip install --system .

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
