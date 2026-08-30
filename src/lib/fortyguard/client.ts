import {
  CACHE_TTL_SECONDS,
  DEFAULT_GRANULARITY,
  FORECAST_HORIZON_HOURS,
  FORTYGUARD_API_KEY,
  FORTYGUARD_BASE_URL,
  FORTYGUARD_MOCK_MODE,
} from "@/lib/config";
import { cacheKey, cached } from "@/lib/cache";
import { boxCacheKey, boxToFeatureCollection, ringBox, ringCentroid } from "@/lib/geo";
import { floorToHour, localParts, utcParts } from "@/lib/time";
import type {
  AnalyticLayer,
  BoundingBox,
  HeatGrid,
  HeatTile,
  LatLng,
  Provenance,
  TemperatureStats,
} from "@/lib/types";
import {
  BASIC_PLAN_ENV_PARAMS,
  FG_FILTER,
  FortyGuardError,
  type FgDateTime,
  type FgEnvParamsRequest,
  type FgEnvParamsResult,
  type FgEnvelope,
  type FgFeatureCollection,
  type FgHeatmapRequest,
  type FgHeatmapResult,
  type FgStatsData,
  type FgStatusData,
  type FgSubmitData,
} from "@/lib/fortyguard/types";
import { mockEnvParamsResult, mockHeatmapResult } from "@/lib/fortyguard/mock";

const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 105_000;
const SUBMIT_TIMEOUT_MS = 20_000;
/**
 * The docs warn that an activity can 404 for a moment right after submission
 * because the record has not propagated yet. Tolerate a short burst of them
 * before treating a 404 as terminal.
 */
const MAX_TRANSIENT_404 = 4;

export const FORTYGUARD_ATTRIBUTION = "FortyGuard Temperature API";
const FORTYGUARD_DOCS = "https://docs-api.fortyguard.com/docs/create-heatmap";

function headers(): Record<string, string> {
  return {
    "api-key": FORTYGUARD_API_KEY ?? "",
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function envelopeError(body: unknown, httpStatus: number): FortyGuardError {
  const env = body as FgEnvelope<unknown> | undefined;
  const message = env?.details?.message ?? env?.message ?? `FortyGuard request failed (${httpStatus})`;
  const hint =
    httpStatus === 401
      ? "Check that FORTYGUARD_API_KEY is set correctly in your environment."
      : httpStatus === 403
        ? "This endpoint or area size is not included in your FortyGuard plan."
        : httpStatus === 429
          ? "FortyGuard rate limit reached. Wait a moment and retry."
          : httpStatus === 400
            ? "The area, date or granularity fell outside what the API accepts."
            : undefined;
  return new FortyGuardError(message, httpStatus, hint);
}

async function submit<TReq extends object>(path: string, payload: TReq): Promise<string> {
  const res = await fetch(`${FORTYGUARD_BASE_URL}/${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
  });

  const body = await res.json().catch(() => undefined);
  if (!res.ok) throw envelopeError(body, res.status);

  const activityId = (body as FgEnvelope<FgSubmitData>)?.data?.activity_id;
  if (!activityId) {
    throw new FortyGuardError(
      "FortyGuard accepted the request but returned no activity_id.",
      502,
      "This usually clears on retry. If it persists, the API response schema may have changed.",
    );
  }
  return activityId;
}

/**
 * Poll `GET /v1/status/{activity_id}` on a fixed interval until the activity
 * reaches a terminal state. Deliberately not exponential: the docs describe
 * "bounded polling", jobs typically settle within a handful of seconds, and a
 * backoff would add latency for no benefit at this cadence.
 */
async function poll<TResult>(
  activityId: string,
  onProgress?: (attempt: number, elapsedMs: number) => void,
): Promise<TResult> {
  const startedAt = Date.now();
  let attempt = 0;
  let transient404s = 0;

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    attempt += 1;
    onProgress?.(attempt, Date.now() - startedAt);

    const res = await fetch(`${FORTYGUARD_BASE_URL}/status/${activityId}`, {
      headers: headers(),
      cache: "no-store",
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
    });
    const body = await res.json().catch(() => undefined);

    if (res.status === 404) {
      transient404s += 1;
      if (transient404s > MAX_TRANSIENT_404) throw envelopeError(body, res.status);
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    if (!res.ok) throw envelopeError(body, res.status);

    const data = (body as FgEnvelope<FgStatusData<TResult>>)?.data;
    const status = (data?.status ?? "").toLowerCase();

    if (status === "completed" || status === "succeeded") {
      if (!data?.result) {
        throw new FortyGuardError(
          "FortyGuard reported the task as complete but returned no result payload.",
          502,
        );
      }
      return data.result;
    }

    if (status === "failed" || status === "error") {
      throw new FortyGuardError(
        `FortyGuard could not process this request (activity ${activityId}).`,
        502,
        "Try a smaller area, a coarser granularity, or a different date.",
      );
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new FortyGuardError(
    "FortyGuard is taking longer than expected to build this heatmap.",
    504,
    "Large areas at 60 m granularity take the longest. Try 100 m or a smaller area.",
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* -------------------------------------------------------------------------- */
/* Normalisation                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The per-tile property name inside `map_data` is not documented, and has
 * differed between releases. Rather than hard-coding one key, probe the
 * plausible names in priority order and fall back to the first finite numeric
 * property on the feature.
 */
const VALUE_KEYS = [
  "average_temperature",
  "avg_temperature",
  "mean_temperature",
  "temperature",
  "temperature_celsius",
  "temp",
  "value",
  "tcm",
  "Temperature",
  "TEMPERATURE",
  "mean",
  "hours",
  "exceedance_hours",
  "persistence_hours",
  "hours_above",
  "count",
];

function extractValue(properties: Record<string, unknown> | null): number | null {
  if (!properties) return null;
  for (const key of VALUE_KEYS) {
    const raw = properties[key];
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string" && raw.trim() !== "" && Number.isFinite(Number(raw))) {
      return Number(raw);
    }
  }
  for (const [key, raw] of Object.entries(properties)) {
    const lower = key.toLowerCase();
    if (lower.includes("id") || lower.includes("tile") || lower.includes("index")) continue;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  }
  return null;
}

function firstRing(coordinates: unknown): [number, number][] | null {
  if (!Array.isArray(coordinates)) return null;
  const candidate = Array.isArray(coordinates[0]?.[0]?.[0]) ? coordinates[0][0] : coordinates[0];
  if (!Array.isArray(candidate)) return null;
  const ring: [number, number][] = [];
  for (const pt of candidate) {
    if (Array.isArray(pt) && typeof pt[0] === "number" && typeof pt[1] === "number") {
      ring.push([pt[0], pt[1]]);
    }
  }
  return ring.length >= 3 ? ring : null;
}

function isFeatureCollection(value: unknown): value is FgFeatureCollection {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as FgFeatureCollection).features)
  );
}

export function normaliseTiles(mapData: unknown): HeatTile[] {
  if (!isFeatureCollection(mapData)) return [];
  const tiles: HeatTile[] = [];

  for (const feature of mapData.features) {
    const value = extractValue(feature.properties);
    if (value === null) continue;
    const ring = firstRing(feature.geometry?.coordinates);
    if (ring) {
      tiles.push({ center: ringCentroid(ring), ring, value });
      continue;
    }
    const coords = feature.geometry?.coordinates;
    if (Array.isArray(coords) && typeof coords[0] === "number" && typeof coords[1] === "number") {
      const center = { lng: coords[0] as number, lat: coords[1] as number };
      tiles.push({ center, ring: [[center.lng, center.lat]], value });
    }
  }

  return tiles;
}

function statsFromTiles(tiles: HeatTile[], reported?: FgStatsData): TemperatureStats {
  const declared = reported?.Temperature_stats;
  const values = tiles.map((t) => t.value);
  const computedMean = values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : 0;
  const computedStd = values.length
    ? Math.sqrt(values.reduce((acc, v) => acc + (v - computedMean) ** 2, 0) / values.length)
    : 0;

  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;

  return {
    min: num(declared?.Minimum, values.length ? Math.min(...values) : 0),
    max: num(declared?.Maximum, values.length ? Math.max(...values) : 0),
    mean: num(declared?.Mean, computedMean),
    stdDev: Math.max(0.05, num(declared?.Standard_deviation, computedStd)),
  };
}

function distributionFrom(tiles: HeatTile[], bucketSize: number) {
  const counts = new Map<number, number>();
  for (const tile of tiles) {
    const bucket = Math.round(tile.value / bucketSize) * bucketSize;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bucket, count]) => ({ bucket: Math.round(bucket * 10) / 10, count }));
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

export interface HeatmapQuery {
  box: BoundingBox;
  dateTime: FgDateTime;
  granularity?: number;
  layer: AnalyticLayer;
  thresholdC?: number;
  direction?: "above" | "below";
  /** ISO timestamp the query describes; used for provenance labelling. */
  observedAt: string;
  ttlSeconds: number;
}

export interface HeatmapFetchMeta {
  cacheHit: boolean;
  cacheAgeSeconds?: number;
  mock: boolean;
}

/**
 * Fetch one analytic layer for an area of interest.
 *
 * Cached on area + date/time + layer + threshold + granularity, which is the
 * full set of inputs that changes the answer. FortyGuard bills per completed
 * task, so a cache hit here is a credit saved.
 */
export async function fetchHeatGrid(query: HeatmapQuery): Promise<HeatGrid> {
  const granularity = query.granularity ?? DEFAULT_GRANULARITY;
  const threshold = query.thresholdC;

  const key = cacheKey("fg-heatmap", [
    boxCacheKey(query.box),
    query.dateTime.start_date,
    query.dateTime.start_time,
    query.dateTime.end_time,
    query.dateTime.filter_type,
    granularity,
    query.layer,
    threshold,
    query.direction,
    FORTYGUARD_MOCK_MODE ? "mock" : "live",
  ]);

  let cacheAgeSeconds: number | undefined;

  const raw = await cached<FgHeatmapResult>(
    key,
    query.ttlSeconds,
    async () => {
      const request: FgHeatmapRequest = {
        polygon_aoi: boxToFeatureCollection(query.box),
        date_time: query.dateTime,
        granularity,
      };
      if (query.layer !== "tcm") request.analytic_type = query.layer;
      if (query.layer === "exceedance" || query.layer === "persistence") {
        request.threshold = threshold;
        request.direction = query.direction ?? "above";
      }

      if (FORTYGUARD_MOCK_MODE) {
        return mockHeatmapResult(request, query.box, new Date(query.observedAt));
      }

      const activityId = await submit("heatmap", request);
      return poll<FgHeatmapResult>(activityId);
    },
    (age) => {
      cacheAgeSeconds = age;
    },
  );

  const tiles = normaliseTiles(raw.map_data);
  console.log(`   🌡️ [FortyGuard API] Layer: "${query.layer}" -> Received ${tiles.length} heat tiles (${query.dateTime.start_date})`);
  const stats = statsFromTiles(tiles, raw.stats_data);
  const unit: HeatGrid["unit"] = query.layer === "tcm" ? "celsius" : "hours";

  const provenance: Provenance = {
    status: FORTYGUARD_MOCK_MODE ? "demo" : cacheAgeSeconds !== undefined ? "cached" : "live",
    source: FORTYGUARD_ATTRIBUTION,
    fetchedAt: new Date(Date.now() - (cacheAgeSeconds ?? 0) * 1000).toISOString(),
    observedAt: query.observedAt,
    url: FORTYGUARD_DOCS,
    note: FORTYGUARD_MOCK_MODE
      ? "Simulated urban heat field. Add FORTYGUARD_API_KEY to switch to measured data."
      : cacheAgeSeconds !== undefined
        ? `Served from cache, ${formatAge(cacheAgeSeconds)} old.`
        : `${granularity} m grid, ${tiles.length} tiles.`,
  };

  return {
    layer: query.layer,
    unit,
    tiles,
    stats,
    distribution: distributionFrom(tiles, unit === "celsius" ? 0.5 : 1),
    provenance,
  };
}

export interface ForecastHourSample {
  timestamp: string;
  hourLocal: number;
  meanTemp: number;
  maxTemp: number;
}

export interface ForecastFetchResult {
  hours: ForecastHourSample[];
  provenance: Provenance;
}

const FORECAST_BUDGET_MS = 50_000;

/**
 * Next `hours` of predicted TCM for an AOI.
 *
 * FortyGuard has no dedicated forecast endpoint: a heatmap whose `date_time`
 * sits up to 12 hours ahead of now is the forecast. TCM is one value per tile
 * per request, so hourly points are one submission each. Results are cached on
 * AOI + hour-bucket with the short forecast TTL — the same query within the
 * hour does not spend another set of credits.
 *
 * Returns null rather than a partial/guessed series when the request fails,
 * times out, or yields fewer than three usable hours.
 */
export async function getForecast(
  aoi: BoundingBox,
  hours = 12,
  options: { granularity?: number; timeZone: string },
): Promise<ForecastFetchResult | null> {
  const hourCount = Math.min(FORECAST_HORIZON_HOURS, Math.max(1, Math.round(hours)));
  const granularity = options.granularity ?? DEFAULT_GRANULARITY;
  const hourBucket = Math.floor(Date.now() / 3_600_000);
  const key = cacheKey("fg-forecast", [
    boxCacheKey(aoi),
    hourBucket,
    hourCount,
    granularity,
    FORTYGUARD_MOCK_MODE ? "mock" : "live",
  ]);

  try {
    const result = await Promise.race([
      cached<ForecastFetchResult | null>(key, CACHE_TTL_SECONDS.forecast, () =>
        fetchForecastHours(aoi, hourCount, granularity, options.timeZone),
      ),
      sleep(FORECAST_BUDGET_MS).then(() => null),
    ]);
    if (!result || result.hours.length < 3) return null;
    return result;
  } catch (error) {
    console.warn(
      "   ⚠️ [FortyGuard] 12-hour forecast unavailable:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

async function fetchForecastHours(
  aoi: BoundingBox,
  hourCount: number,
  granularity: number,
  timeZone: string,
): Promise<ForecastFetchResult | null> {
  const start = floorToHour(new Date());
  const settled = await Promise.allSettled(
    Array.from({ length: hourCount }, (_, offset) =>
      fetchOneForecastHour(aoi, start, offset, granularity, timeZone),
    ),
  );

  const hours: ForecastHourSample[] = [];
  for (const item of settled) {
    if (item.status === "fulfilled" && item.value) hours.push(item.value);
  }
  hours.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (hours.length < 3) return null;

  console.log(`   🔮 [FortyGuard] 12-hour forecast: ${hours.length} hourly grids`);

  return {
    hours,
    provenance: {
      status: FORTYGUARD_MOCK_MODE ? "demo" : "live",
      source: `${FORTYGUARD_ATTRIBUTION} — 12-hour forecast`,
      fetchedAt: new Date().toISOString(),
      observedAt: hours[0]?.timestamp,
      note: FORTYGUARD_MOCK_MODE
        ? "Simulated 12-hour forecast. Add FORTYGUARD_API_KEY to switch to predicted data."
        : `${hours.length} hourly ${granularity} m snapshots from now.`,
    },
  };
}

async function fetchOneForecastHour(
  aoi: BoundingBox,
  start: Date,
  offsetHours: number,
  granularity: number,
  timeZone: string,
): Promise<ForecastHourSample | null> {
  const instant = new Date(start.getTime() + offsetHours * 3_600_000);
  const utc = utcParts(instant);

  const grid = await fetchHeatGrid({
    box: aoi,
    dateTime: singleHour(utc.date, utc.time),
    granularity,
    layer: "tcm",
    observedAt: instant.toISOString(),
    ttlSeconds: CACHE_TTL_SECONDS.forecast,
  });

  if (!grid.tiles.length) return null;
  if (!Number.isFinite(grid.stats.mean) || !Number.isFinite(grid.stats.max)) return null;

  return {
    timestamp: instant.toISOString(),
    hourLocal: localParts(instant, timeZone).hour,
    meanTemp: grid.stats.mean,
    maxTemp: grid.stats.max,
  };
}

export interface EnvParamsQuery {
  point: LatLng;
  /** Anchor temperature in °C, taken from the heatmap tile at this point. */
  temperatureC: number;
  dateTime: FgDateTime;
  observedAt: string;
  ttlSeconds: number;
}

export interface EnvParamsSeries {
  timestamps: string[];
  heatIndexC: (number | null)[];
  apparentTempC: (number | null)[];
  relativeHumidityPct: (number | null)[];
  timezone?: string;
  timezoneOffsetHours?: number;
  provenance: Provenance;
}

/**
 * Hourly thermal-comfort series for a single point.
 *
 * The heatmap endpoint returns one value per tile per request, so it cannot
 * produce an hourly curve without one submission per hour. Environmental
 * Parameters returns time-aligned arrays for a range in a single call, which is
 * both cheaper and the metric public-health agencies actually act on.
 *
 * Requests only the three parameters the API Basic plan allows.
 */
export async function fetchEnvParams(query: EnvParamsQuery): Promise<EnvParamsSeries> {
  const key = cacheKey("fg-env", [
    query.point.lat.toFixed(4),
    query.point.lng.toFixed(4),
    query.dateTime.start_date,
    query.dateTime.start_time,
    query.dateTime.end_time,
    query.dateTime.filter_type,
    Math.round(query.temperatureC),
    FORTYGUARD_MOCK_MODE ? "mock" : "live",
  ]);

  let cacheAgeSeconds: number | undefined;

  const raw = await cached<FgEnvParamsResult>(
    key,
    query.ttlSeconds,
    async () => {
      const request: FgEnvParamsRequest = {
        latitude: Number(query.point.lat.toFixed(6)),
        longitude: Number(query.point.lng.toFixed(6)),
        temperature: Math.round(query.temperatureC * 10) / 10,
        date_time: query.dateTime,
        analysis: [...BASIC_PLAN_ENV_PARAMS],
      };

      if (FORTYGUARD_MOCK_MODE) return mockEnvParamsResult(request);

      const activityId = await submit("env_params", request);
      return poll<FgEnvParamsResult>(activityId);
    },
    (age) => {
      cacheAgeSeconds = age;
    },
  );

  const location = raw.locations?.[0];
  const params = location?.parameters ?? {};

  const clean = (arr: (number | null)[] | undefined): (number | null)[] =>
    (arr ?? []).map((v) => (v === null || v === undefined || v <= -900 ? null : v));

  return {
    timestamps: raw.metadata?.timestamps ?? [],
    heatIndexC: clean(params.heat_index_celsius),
    apparentTempC: clean(params.apparent_temperature_celsius),
    relativeHumidityPct: clean(params.relative_humidity_percent),
    timezone: raw.metadata?.timezone,
    timezoneOffsetHours: raw.metadata?.timezone_offset_hours,
    provenance: {
      status: FORTYGUARD_MOCK_MODE ? "demo" : cacheAgeSeconds !== undefined ? "cached" : "live",
      source: `${FORTYGUARD_ATTRIBUTION} — Environmental Parameters`,
      fetchedAt: new Date(Date.now() - (cacheAgeSeconds ?? 0) * 1000).toISOString(),
      observedAt: query.observedAt,
      url: "https://docs-api.fortyguard.com/docs/environmental-parameters",
      note: FORTYGUARD_MOCK_MODE
        ? "Simulated heat index and humidity."
        : "Heat index, apparent temperature and relative humidity.",
    },
  };
}

function formatAge(seconds: number): string {
  if (seconds < 90) return `${Math.round(seconds)}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min`;
  if (seconds < 172_800) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86_400)} d`;
}

/* -------------------------------------------------------------------------- */
/* Date/time helpers                                                          */
/* -------------------------------------------------------------------------- */

export function singleHour(date: string, time: string): FgDateTime {
  return { start_date: date, start_time: time, filter_type: FG_FILTER.singleHour };
}

/** Range of hours on one day. The API caps this window at 23 hours. */
export function hourRange(date: string, startTime: string, endTime: string): FgDateTime {
  return {
    start_date: date,
    start_time: startTime,
    end_time: endTime,
    filter_type: FG_FILTER.rangeOfHours,
  };
}

export function singleDay(date: string): FgDateTime {
  return { start_date: date, filter_type: FG_FILTER.singleDay };
}

export { ringBox };
