FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    CLOUD_NEST_HOST=0.0.0.0 \
    PORT=8787 \
    CLOUD_NEST_DB=/data/cloud_nest.sqlite3 \
    CLOUD_NEST_DEV_AUTH=0

WORKDIR /app
COPY backend /app/backend
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

RUN useradd --system --uid 10001 --create-home app \
    && mkdir -p /data \
    && chown app:app /data

USER app
EXPOSE 8787
CMD ["sh", "-c", "exec uvicorn server:app --app-dir /app/backend --host \"$CLOUD_NEST_HOST\" --port \"$PORT\""]
