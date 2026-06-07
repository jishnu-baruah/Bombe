/**
 * cache.ts, a small shared cache over Upstash Redis (REST), with an in-memory
 * fallback. Used to make the on-chain read paths fast and consistent across
 * serverless invocations (a per-instance Map is lost on every cold start).
 *
 * No SDK dependency: the Upstash REST API takes a command array as the POST
 * body. If the env is not set (local dev, tests), it falls back to in-memory.
 */

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const enabled = Boolean(REDIS_URL && REDIS_TOKEN);

const mem = new Map<string, { value: string; expiresAt: number }>();

async function command(args: (string | number)[]): Promise<unknown> {
  const res = await fetch(REDIS_URL as string, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(2500),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { result?: unknown };
  return data.result ?? null;
}

export async function cacheGet(key: string): Promise<string | null> {
  if (enabled) {
    try {
      const result = await command(["GET", key]);
      if (typeof result === "string") return result;
    } catch {
      // fall through to in-memory
    }
  }
  const entry = mem.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.value;
  if (entry) mem.delete(key);
  return null;
}

export async function cacheSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  if (enabled) {
    try {
      await command(["SET", key, value, "EX", ttlSeconds]);
      return;
    } catch {
      // fall through to in-memory
    }
  }
  mem.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

/** JSON convenience: returns the parsed value or null on miss/parse error. */
export async function cacheGetJson<T>(key: string): Promise<T | null> {
  const raw = await cacheGet(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSetJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  await cacheSet(key, JSON.stringify(value), ttlSeconds);
}
