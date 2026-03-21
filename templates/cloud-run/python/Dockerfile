# @agent-directive: DO NOT modify the base image unless aligning ALL Python Cloud Run templates in hlbw-ai-hub.
FROM python:3.11-slim

# Allow statements and log messages to immediately appear in the Knative logs
ENV PYTHONUNBUFFERED True

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Cloud Run respects the PORT environment variable
ENV PORT=8080

# @agent-directive: DO NOT modify the entrypoint unless aligning all Cloud Run templates. Use uvicorn/gunicorn for ASGI.
CMD exec uvicorn main:app --host 0.0.0.0 --port ${PORT} --workers 1
