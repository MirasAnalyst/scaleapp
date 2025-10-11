import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type ArtifactStorage = "s3" | "local";

export interface StoreArtifactOptions {
  buffer: Buffer | Uint8Array;
  contentType: string;
  filename: string;
  metadata?: Record<string, string>;
}

export interface StoredArtifactLocation {
  storage: ArtifactStorage;
  key: string;
  filename: string;
  contentType: string;
}

const bucket = process.env.ROCKET_S3_BUCKET;
const outputsDir =
  process.env.ROCKET_OUTPUT_DIR ?? path.join(process.cwd(), "outputs");

let s3Client: S3Client | null = null;

function ensureS3Client(): S3Client {
  if (s3Client) {
    return s3Client;
  }

  if (!bucket) {
    throw new Error(
      "ROCKET_S3_BUCKET is not set. Configure S3 or use local artifact storage.",
    );
  }

  s3Client = new S3Client({
    region: process.env.AWS_REGION ?? "us-east-1",
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
  });

  return s3Client;
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-z0-9.\-_]/gi, "_").toLowerCase();
}

function generateKey(filename: string) {
  const base = sanitizeFilename(filename);
  const id = randomUUID();
  return `rocket/${id}/${base}`;
}

async function storeLocal({
  buffer,
  contentType,
  filename,
}: StoreArtifactOptions): Promise<StoredArtifactLocation> {
  const key = generateKey(filename);
  const absolutePath = path.join(outputsDir, key);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  await fs.writeFile(absolutePath, data);
  await fs.writeFile(
    `${absolutePath}.meta.json`,
    JSON.stringify(
      { contentType, filename, storedAt: new Date().toISOString() },
      null,
      2,
    ),
  );

  return { storage: "local", key, filename, contentType };
}

async function storeS3({
  buffer,
  contentType,
  filename,
  metadata,
}: StoreArtifactOptions): Promise<StoredArtifactLocation> {
  const key = generateKey(filename);
  const client = ensureS3Client();
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: data,
      ContentType: contentType,
      Metadata: metadata,
    }),
  );

  return { storage: "s3", key, filename, contentType };
}

export async function storeArtifact(
  options: StoreArtifactOptions,
): Promise<StoredArtifactLocation> {
  if (bucket) {
    return storeS3(options);
  }
  return storeLocal(options);
}

export async function getArtifactDownloadUrl(
  artifact: StoredArtifactLocation,
  expiresInSeconds = 3600,
): Promise<string> {
  if (artifact.storage === "s3") {
    const client = ensureS3Client();
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: artifact.key,
    });
    // Use headless signed URL for existing object
    return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  }

  return `/api/artifacts/${artifact.key}`;
}

export async function resolveLocalArtifactPath(key: string) {
  const resolved = path.join(outputsDir, key);
  const normalized = path.normalize(resolved);
  if (!normalized.startsWith(path.normalize(outputsDir))) {
    throw new Error("Invalid artifact path");
  }
  return normalized;
}
