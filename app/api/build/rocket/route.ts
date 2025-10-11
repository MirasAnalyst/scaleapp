import { NextRequest, NextResponse } from "next/server";
import { generateRocketSpec } from "@/lib/openai";
import {
  getRocketJob,
  getRocketQueue,
  RocketArtifact,
  RocketBuildJobData,
  RocketBuildJobResult,
} from "@/lib/queue/rocket-queue";
import { getArtifactDownloadUrl } from "@/lib/storage/artifacts";

export const runtime = "nodejs";

function buildEngineerContext() {
  return [
    "You are a senior mechanical design engineer specializing in launch vehicles and complex aerospace systems.",
    "Analyse the user request, produce a full RocketSpec JSON covering stages, parts, materials, tolerances, and checks.",
    "Cross-reference the supplied design rules and enforce minimum geometry and safety margins.",
  ].join(" ");
}

function summarizeSpec(spec: RocketBuildJobData["spec"]) {
  return {
    project: spec.project.name,
    revision: spec.project.revision,
    missionProfile: spec.project.missionProfile,
    stages: spec.stages.length,
    parts: spec.parts.length,
    generatedAtIso: spec.generatedAtIso,
  };
}

interface CreateJobResponse {
  jobId: string;
  status: "queued";
  specSummary: ReturnType<typeof summarizeSpec>;
}

interface JobStatusResponse {
  jobId: string;
  status: string;
  state: string;
  progress: number | null;
  specSummary?: ReturnType<typeof summarizeSpec>;
  artifacts?: Array<RocketArtifact & { downloadUrl: string }>;
  logs?: string[];
  warnings?: string[];
  analysisChecks?: RocketBuildJobResult["analysisChecks"];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const prompt: string | undefined = body?.prompt;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 10) {
      return NextResponse.json(
        { error: "prompt must be a descriptive string (min 10 characters)" },
        { status: 400 },
      );
    }

    const engineerContext = buildEngineerContext();
    const mergedPrompt = `${engineerContext}\n\nUser specification:\n${prompt.trim()}`;

    const spec = await generateRocketSpec(mergedPrompt);
    const queue = getRocketQueue();

    const job = await queue.add(
      "rocket-build",
      {
        prompt: prompt.trim(),
        mergedPrompt,
        spec,
      },
      {
        attempts: 3,
        removeOnComplete: true,
        removeOnFail: false,
        priority: 3,
      },
    );

    const response: CreateJobResponse = {
      jobId: job.id,
      status: "queued",
      specSummary: summarizeSpec(spec),
    };

    return NextResponse.json(response, { status: 202 });
  } catch (error) {
    console.error("[rocket-build] request failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ error: "jobId query parameter is required" }, { status: 400 });
  }

  try {
    const job = await getRocketJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const state = await job.getState();
    const progress =
      typeof job.progress === "number" ? job.progress : job.progress ?? null;
    const result = job.returnvalue as RocketBuildJobResult | undefined;

    let artifacts: JobStatusResponse["artifacts"];
    if (result?.artifacts?.length) {
      artifacts = await Promise.all(
        result.artifacts.map(async (artifact) => ({
          ...artifact,
          downloadUrl: await getArtifactDownloadUrl(artifact),
        })),
      );
    }

    const response: JobStatusResponse = {
      jobId,
      status: result ? "completed" : state,
      state,
      progress: typeof progress === "number" ? progress : null,
      logs: result?.logs,
      warnings: result?.warnings,
      analysisChecks: result?.analysisChecks,
    };

    if (artifacts) {
      response.artifacts = artifacts;
    }

    if (job.data?.spec) {
      response.specSummary = summarizeSpec(job.data.spec);
    }

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("[rocket-build] status failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
