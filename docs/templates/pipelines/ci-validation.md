# CI / Pull Request Validation Pipeline

The **CI Validation** pipeline is arguably the most important workflow for day-to-day development. It mimics the local execution environment of your application (native Node.js and Python) to ensure that code is completely valid before being merged into the `main` branch.

## Purpose

- Code Formatting verification (Prettier, Black).
- Static Analysis (ESLint, Flake8).
- Execution of unit test suites via Jest and Pytest.
- Blocking Pull Requests that fail any of the above checks.

## How it works

This pipeline checks out your code, sets up the language runtimes, installs dependencies using package managers (avoiding Docker overhead), and runs test scripts.

## Finding the Template

- **GitHub Action**: Copy `templates/pipelines/github-actions/ci-validation.yml` into `.github/workflows/ci-validation.yml`.

## Local Equivalent

If you want to run exactly what the CI pipeline runs on your own machine before pushing, look at the script at `templates/pipelines/local/run-local.sh`. Executing this local script prevents frustrating round-trips waiting for GitHub Actions to fail.
