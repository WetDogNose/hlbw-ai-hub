# Docker Build & Testing Pipeline

Because production deployments (like Cloud Run) rely exclusively on Docker containers, it is critical that we know if a Docker image actually builds successfully *before* we attempt to release it.

## Purpose
- Verify `Dockerfile` syntax and structure.
- Catch missing dependencies that were installed locally but forgotten in the `requirements.txt` or `package.json`.
- (Optional) execute `docker-compose up` to run integration tests against a locally spun-up database or Redis cache inside the GitHub Runner.

## How it works
On a Pull Request or push, the workflow will trigger a `docker build` command targeting your service. It intentionally does *not* push the image to a registry to save cost and space. Its sole purpose is ensuring the build step succeeds.

## Finding the Template
- **GitHub Action**: Copy `templates/pipelines/github-actions/docker-build-test.yml` into `.github/workflows/docker-build-test.yml`.
- **Docker Compose Template (Test Environment)**: Depending on your service, you might want to orchestrate testing containers alongside your main image. 
