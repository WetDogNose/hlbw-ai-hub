import os
from fastapi import FastAPI
from otel_setup import init_telemetry
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

logger = init_telemetry("python-cloudrun-agent")
app = FastAPI()

FastAPIInstrumentor.instrument_app(app)

@app.get("/")
def read_root():
    logger.info("Handling root request")
    return {"status": "ok", "message": "Hello from Python Cloud Run Template"}

# Usually, uvicorn is started via Dockerfile CMD, but keeping this for local testing
if __name__ == '__main__':
    import uvicorn
    port = int(os.environ.get('PORT', 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
