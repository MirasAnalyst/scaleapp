import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { resolveLocalArtifactPath } from "@/lib/storage/artifacts";

export const runtime = "nodejs";

interface RouteParams {
  key: string[];
}

export async function GET(
  request: NextRequest,
  { params }: { params: RouteParams },
) {
  if (!params?.key?.length) {
    return NextResponse.json({ error: "Artifact key is required" }, { status: 400 });
  }

  const key = params.key.join("/");

  try {
    const absolutePath = await resolveLocalArtifactPath(key);
    const data = await fs.readFile(absolutePath);

    let contentType = "application/octet-stream";
    let filename = path.basename(absolutePath);

    try {
      const metadata = await fs.readFile(`${absolutePath}.meta.json`, "utf8");
      const parsed = JSON.parse(metadata);
      contentType = parsed.contentType ?? contentType;
      filename = parsed.filename ?? filename;
    } catch {
      // ignore missing metadata
    }

    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Artifact retrieval error:", error);
    return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
  }
}
