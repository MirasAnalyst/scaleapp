import { Worker } from "bullmq";
import { getRedisConnection } from "../lib/queue/connection";
import {
  ROCKET_QUEUE_NAME,
  RocketArtifact,
  RocketBuildJobData,
  RocketBuildJobResult,
} from "../lib/queue/rocket-queue";
import { storeArtifact } from "../lib/storage/artifacts";

interface CadServiceArtifact {
  type: RocketArtifact["type"];
  filename: string;
  contentType: string;
  data: string;
  encoding: "base64";
}

interface CadServiceResponse {
  artifacts: CadServiceArtifact[];
  logs: string[];
  warnings: string[];
  analysis_checks: RocketBuildJobResult["analysisChecks"];
}

const cadServiceUrl = process.env.CAD_SERVICE_URL ?? "http://localhost:8001";
const concurrency = parseInt(process.env.ROCKET_WORKER_CONCURRENCY ?? "1", 10);

export function startRocketWorker() {
  const worker = new Worker<RocketBuildJobData, RocketBuildJobResult>(
    ROCKET_QUEUE_NAME,
    async (job) => {
      await job.updateProgress(5);
      await job.log(
        `Starting CAD build for ${job.data.spec.project.name} (revision ${job.data.spec.project.revision})`,
      );

      const response = await fetch(`${cadServiceUrl}/build/rocket`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spec: job.data.spec,
          prompt: job.data.prompt,
          job_id: job.id,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`CAD service returned ${response.status}: ${text}`);
      }

      const payload = (await response.json()) as CadServiceResponse;
      await job.updateProgress(40);
      await job.log(
        `CAD service produced ${payload.artifacts?.length ?? 0} artifacts`,
      );

      const artifacts: RocketArtifact[] = [];

      for (const artifact of payload.artifacts ?? []) {
        const buffer = Buffer.from(artifact.data, artifact.encoding);
        const stored = await storeArtifact({
          buffer,
          filename: artifact.filename,
          contentType: artifact.contentType,
          metadata: {
            "rocket-job-id": job.id ?? "",
            "rocket-artifact-type": artifact.type,
          },
        });

        artifacts.push({
          type: artifact.type,
          filename: stored.filename,
          contentType: stored.contentType,
          storage: stored.storage,
          key: stored.key,
        });
      }

      await job.updateProgress(85);

      return {
        artifacts,
        logs: payload.logs ?? [],
        warnings: payload.warnings ?? [],
        analysisChecks: payload.analysis_checks ?? job.data.spec.analysisChecks,
        spec: job.data.spec,
      };
    },
    {
      connection: getRedisConnection(),
      concurrency,
    },
  );

  worker.on("completed", async (job) => {
    console.log(
      `[rocket-worker] Job ${job.id} completed in ${
        job.finishedOn && job.processedOn
          ? job.finishedOn - job.processedOn
          : "unknown"
      } ms`,
    );
  });

  worker.on("failed", async (job, error) => {
    console.error(`[rocket-worker] Job ${job?.id} failed`, error);
  });

  return worker;
}

if (require.main === module) {
  console.log(
    `[rocket-worker] Starting Rocket CAD worker (CAD_SERVICE_URL=${cadServiceUrl}, concurrency=${concurrency})`,
  );
  startRocketWorker();
}
