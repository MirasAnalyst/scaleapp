import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const cadServiceUrl = process.env.CAD_SERVICE_URL ?? "http://localhost:8001";
const specPath = path.resolve("samples/rocket_spec.sample.json");

async function main() {
  const specJson = await readFile(specPath, "utf8");
  const spec = JSON.parse(specJson);

  const response = await fetch(`${cadServiceUrl}/build/rocket`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      spec,
      prompt: "Sample end-to-end validation",
      job_id: "rocket-e2e-test",
    }),
  });

  assert.equal(
    response.status,
    200,
    `CAD service returned ${response.status} ${response.statusText}`,
  );

  const payload = await response.json();
  assert(Array.isArray(payload.artifacts), "Response must include artifacts array");
  assert(
    payload.artifacts.length >= 2,
    `Expected at least 2 artifacts, received ${payload.artifacts.length}`,
  );

  const artifactTypes = payload.artifacts.map((artifact) => artifact.type);
  assert(
    artifactTypes.includes("step"),
    "STEP artifact missing from response",
  );
  assert(
    artifactTypes.includes("dxf"),
    "DXF artifact missing from response",
  );

  payload.artifacts.forEach((artifact) => {
    assert(artifact.data, `Artifact ${artifact.filename} missing data payload`);
    const size = Buffer.from(artifact.data, artifact.encoding ?? "base64").length;
    assert(size > 1024, `Artifact ${artifact.filename} appears empty (size ${size} bytes)`);
  });

  console.log(
    `✅ Rocket CAD service returned ${payload.artifacts.length} artifacts (${artifactTypes.join(", ")})`,
  );
}

main().catch((error) => {
  console.error("❌ Rocket CAD end-to-end test failed:", error);
  process.exit(1);
});
