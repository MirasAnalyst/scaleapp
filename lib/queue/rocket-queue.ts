import { Queue, QueueEvents, Job, JobsOptions, MetricsTime } from "bullmq";
import { getRedisConnection } from "./connection";
import { RocketSpecType } from "@/types/rocket";

export const ROCKET_QUEUE_NAME = "rocket-builds";

export type RocketArtifactType = "dxf" | "pdf" | "step" | "log";

export interface RocketArtifact {
  type: RocketArtifactType;
  filename: string;
  contentType: string;
  storage: "s3" | "local";
  key: string;
  url?: string;
}

export interface RocketBuildJobData {
  prompt: string;
  spec: RocketSpecType;
  mergedPrompt: string;
}

export interface RocketBuildJobResult {
  artifacts: RocketArtifact[];
  logs: string[];
  analysisChecks: RocketSpecType["analysisChecks"];
  spec: RocketSpecType;
  warnings?: string[];
}

let queue: Queue<RocketBuildJobData, RocketBuildJobResult> | null = null;
let queueEvents: QueueEvents | null = null;

function getQueueOptions(): JobsOptions {
  return {
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: true,
    removeOnFail: false,
  };
}

export function getRocketQueue() {
  if (!queue) {
    queue = new Queue<RocketBuildJobData, RocketBuildJobResult>(ROCKET_QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: getQueueOptions(),
    });
  }
  return queue;
}

export function getRocketQueueEvents() {
  if (!queueEvents) {
    queueEvents = new QueueEvents(ROCKET_QUEUE_NAME, {
      connection: getRedisConnection(),
    });
  }
  return queueEvents;
}

export async function getRocketJob(jobId: string) {
  const q = getRocketQueue();
  return Job.fromId<RocketBuildJobData, RocketBuildJobResult>(q, jobId);
}

export async function getRocketQueueMetrics() {
  const q = getRocketQueue();
  return q.getMetrics("completed", MetricsTime.ONE_HOUR);
}
