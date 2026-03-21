# @agent-directive: DO NOT modify the base image unless aligning ALL Python templates in hlbw-ai-hub.
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=8080
EXPOSE 8080

# @agent-directive: Maintain the standard entrypoint.
CMD ["python", "main.py"]
