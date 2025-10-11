import IORedis, { RedisOptions } from "ioredis";

let cachedConnection: IORedis | null = null;

function createRedisOptions(): RedisOptions {
  const url = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

  return {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    enableAutoPipelining: true,
    reconnectOnError: () => true,
    ...(url.startsWith("redis://")
      ? { host: undefined, port: undefined, password: undefined, db: undefined, path: undefined }
      : {}),
  };
}

export function getRedisConnection(): IORedis {
  if (cachedConnection) {
    return cachedConnection;
  }

  const url = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
  cachedConnection = new IORedis(url, createRedisOptions());

  cachedConnection.on("error", (error) => {
    console.error("[redis] connection error", error);
  });

  return cachedConnection;
}
