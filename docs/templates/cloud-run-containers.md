# Cloud Run Container Templates

The `templates/cloud-run/` directory contains production-ready container configurations specifically tailored for Google Cloud Run deployments.

## When to Use
Use these templates when:
1. You are deploying an agent or API to Google Cloud Run.
2. You require auto-scaling from zero to handle HTTP requests.
3. You need optimized worker configurations (like `uvicorn` in Python) to handle concurrent connections efficiently.

## Structure

### Python (`templates/cloud-run/python`)
- **Framework**: FastAPI + Uvicorn
- **Capabilities**: High-performance asynchronous API framework capable of running complex AI inferences or routing.
- **Why FastAPI?**: Because Cloud Run pricing relies on handling concurrency correctly, FastAPI with an ASGI server like Uvicorn ensures non-blocking I/O.
- **How to Use**:
  1. Copy the contents.
  2. Mount your agent endpoints inside `main.py` using standard FastAPI decorators.
  3. Deploy using `gcloud run deploy --source .` or set up a Cloud Build pipeline.

### Node.js (`templates/cloud-run/node`)
- **Framework**: Express.js
- **Capabilities**: Reliable, battle-tested web framework setup to leverage Cloud Run's HTTP interface.
- **How to Use**:
  1. Copy the contents.
  2. Run `npm install` locally to lock the dependencies.
  3. Map your service logic to the Express routers in `index.js`.
  4. Deploy using standard Cloud Run commands.

## Cloud Run Specifics
- **Logs**: The Python template specifically sets `ENV PYTHONUNBUFFERED True` so your `print()` statements stream immediately to GCP logs.
- **Concurrency**: By default, Node.js and ASGI Python templates will successfully handle concurrent requests out-of-the-box, saving costs by utilizing fewer container instances per request.
