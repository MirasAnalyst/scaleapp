# Rocket CAD Pipeline

This document explains how the new `/autocad/mechanical` workflow generates AutoCAD-ready deliverables from a natural-language request.

## Architecture Overview
- **Prompt ingestion (Next.js)** – the UI posts the user's description to `/api/build/rocket`. The API merges the request with the design rules and uses `generateRocketSpec` to obtain a validated RocketSpec JSON document from OpenAI (function-calling mode).
- **Queue and status API** – the parsed spec is enqueued on the BullMQ queue `rocket-builds`. `/api/build/rocket?jobId=…` polls Redis for job status, progress, warnings, and download links.
- **Worker (Node)** – `workers/rocketWorker.ts` pulls jobs, streams logs, and forwards the spec to the Python CAD service. Returned artifacts are persisted via `storeArtifact` (S3 if configured, otherwise `/outputs`) before the job completes.
- **CAD service (FastAPI + FreeCAD)** – `cad_worker/main.py` runs inside its own container or process. It validates the spec with Pydantic, uses CadQuery to build solids, TechDraw to create PDF/DXF drawings, and ezdxf for layout plans. Sanity checks (thickness, edge distance, hoop stress, CG, clearance) are executed before results are returned.
- **Downloads** – artifacts are exposed through signed S3 URLs or the `/api/artifacts/*` proxy for local storage. The UI polls until the worker finishes and then surfaces download buttons, analysis checks, logs, and warnings.

## Services

| Service | Description | Command |
| --- | --- | --- |
| Web (Next.js) | UI + API endpoints | `npm run dev` |
| Redis | Queue backing store | `docker run -p 6379:6379 redis:7` |
| Worker | BullMQ worker (Node 18+) | `npx tsx workers/rocketWorker.ts` |
| CAD | FastAPI + FreeCAD | `uvicorn cad_worker.main:app --reload --port 8001` (or Docker) |

### Environment Variables
```
REDIS_URL=redis://localhost:6379
CAD_SERVICE_URL=http://localhost:8001
ROCKET_S3_BUCKET=<bucket-name>        # optional – enables S3 artifacts
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
ROCKET_OUTPUT_DIR=./outputs           # optional local artifact directory
```

## Running Everything with Docker Compose

1. Build the CAD image:
   ```bash
   docker compose -f docker-compose.rocket.yml build cad
   ```
2. Start the stack (Redis, CAD, worker, web):
   ```bash
   docker compose -f docker-compose.rocket.yml up
   ```
3. Open `http://localhost:3006/autocad/mechanical`, enter a request, and watch the job status panel update with progress, checks, and download links.

## Developer Notes
- The RocketSpec schema source of truth lives in `types/rocket.ts` (Zod). The same structure is re-validated inside the Python service via `cad_worker/models.py`.
- Update `docs/rocket-design-rules.md` if drafting requirements change; the prompt helper in `lib/rocket/design-rules.ts` should be kept in sync.
- Artifacts are copied to `/outputs` when S3 credentials are absent. The Next.js `app/api/artifacts/[...key]` route streams those files to the browser.
- The end-to-end test (`tests/rocket-e2e.mjs`) exercises the CAD service directly with the sample spec.
- Job logs surface in three places: Redis (`bullmq`), the `/api/build/rocket` status response, and the UI “CAD Worker Logs” panel.

## Operational Observability
- Structured job logs are written via `job.log` in the worker and emitted to stdout for container log collection.
- The queue exposes basic metrics via `getRocketQueueMetrics()`; expand this if you plug into a monitoring stack.
- Timeout and retry behaviour lives in `lib/queue/rocket-queue.ts` (`attempts = 3`, exponential backoff, 10-minute timeout).
