import { createHash } from "node:crypto";
import { KV_REST_API_TOKEN, KV_REST_API_URL } from "@/lib/config";

/**
 * A small pluggable cache.
 *
 * FortyGuard bills per successfully completed task, so caching is a cost
 * control, not an optimisation. The tiers, in priority order:
 *
 *  1. Vercel KV / Upstash Redis over REST — survives across serverless
 *     invocations and deployments. This is the tier that actually protects the
 *     credit balance in production. Spoken to with `fetch` rather than a client
 *     library so the bundle stays small and edge-compatible.
 *  2. Process memory — always present, bounded, and enough to collapse the
 *     burst of parallel calls a single analysis makes.
 *  3. Filesystem, during local development only, so an `npm run dev` restart
 *     does not re-spend credits.
 *
 * A cache miss is never fatal: every read failure degrades to "no cached value".
 */

export interface CacheEntry<T> {
  value: T;
  /** Epoch millis when the entry was written. */
  storedAt: number;
}

const MEMORY_LIMIT = 400;
const memory = new Map<string, { value: unknown; storedAt: number; expiresAt: number }>();

function memoryGet<T>(key: string): CacheEntry<T> | null {
  const hit = memory.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    memory.delete(key);
    return null;
  }
  memory.delete(key);
  memory.set(key, hit);
  return { value: hit.value as T, storedAt: hit.storedAt };
}

function memorySet(key: string, value: unknown, ttlSeconds: number): void {
  if (memory.size >= MEMORY_LIMIT) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
  memory.set(key, {
    value,
    storedAt: Date.now(),
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

const kvEnabled = Boolean(KV_REST_API_URL && KV_REST_API_TOKEN);

async function kvGet<T>(key: string): Promise<CacheEntry<T> | null> {
  if (!kvEnabled) return null;
  try {
    const res = await fetch(`${KV_REST_API_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: string | null };
    if (!body.result) return null;
    return JSON.parse(body.result) as CacheEntry<T>;
  } catch {
    return null;
  }
}

async function kvSet(key: string, entry: CacheEntry<unknown>, ttlSeconds: number): Promise<void> {
  if (!kvEnabled) return;
  try {
    await fetch(`${KV_REST_API_URL}/set/${encodeURIComponent(key)}?EX=${ttlSeconds}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KV_REST_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(entry),
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
  } catch {
  }
}

const fileCacheEnabled =
  process.env.NODE_ENV !== "production" && !process.env.VERCEL;

async function fileCacheDir(): Promise<string | null> {
  if (!fileCacheEnabled) return null;
  try {
    const path = await import("node:path");
    const fs = await import("node:fs/promises");
    const dir = path.join(process.cwd(), ".cache");
    await fs.mkdir(dir, { recursive: true });
    return dir;
  } catch {
    return null;
  }
}

function fileNameFor(key: string): string {
  return `${createHash("sha256").update(key).digest("hex")}.json`;
}

async function fileGet<T>(key: string, ttlSeconds: number): Promise<CacheEntry<T> | null> {
  const dir = await fileCacheDir();
  if (!dir) return null;
  try {
    const path = await import("node:path");
    const fs = await import("node:fs/promises");
    const raw = await fs.readFile(path.join(dir, fileNameFor(key)), "utf8");
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() - entry.storedAt > ttlSeconds * 1000) return null;
    return entry;
  } catch {
    return null;
  }
}

async function fileSet(key: string, entry: CacheEntry<unknown>): Promise<void> {
  const dir = await fileCacheDir();
  if (!dir) return;
  try {
    const path = await import("node:path");
    const fs = await import("node:fs/promises");
    await fs.writeFile(path.join(dir, fileNameFor(key)), JSON.stringify(entry), "utf8");
  } catch {
  }
}

export async function cacheGet<T>(key: string, ttlSeconds: number): Promise<CacheEntry<T> | null> {
  const inMemory = memoryGet<T>(key);
  if (inMemory) return inMemory;

  const remote = await kvGet<T>(key);
  if (remote) {
    memorySet(key, remote.value, ttlSeconds);
    return remote;
  }

  const onDisk = await fileGet<T>(key, ttlSeconds);
  if (onDisk) {
    memorySet(key, onDisk.value, ttlSeconds);
    return onDisk;
  }

  return null;
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const entry: CacheEntry<T> = { value, storedAt: Date.now() };
  memorySet(key, value, ttlSeconds);
  await Promise.all([kvSet(key, entry, ttlSeconds), fileSet(key, entry)]);
}

/**
 * Read-through helper. `onHit` receives the age of the cached value in seconds
 * so callers can label provenance as `cached` and show data recency honestly.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  producer: () => Promise<T>,
  onHit?: (ageSeconds: number, storedAt: number) => void,
): Promise<T> {
  const hit = await cacheGet<T>(key, ttlSeconds);
  if (hit) {
    onHit?.(Math.round((Date.now() - hit.storedAt) / 1000), hit.storedAt);
    return hit.value;
  }
  const value = await producer();
  await cacheSet(key, value, ttlSeconds);
  return value;
}

export function cacheKey(namespace: string, parts: (string | number | undefined)[]): string {
  const body = parts.filter((p) => p !== undefined).join(":");
  if (body.length <= 160) return `heatlens:${namespace}:${body}`;
  return `heatlens:${namespace}:${createHash("sha256").update(body).digest("hex")}`;
}

export function describeCacheBackend(): string {
  if (kvEnabled) return "Vercel KV / Upstash Redis";
  if (fileCacheEnabled) return "in-memory + local filesystem";
  return "in-memory (per instance)";
}
