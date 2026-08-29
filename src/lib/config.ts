/**
 * Central runtime configuration.
 *
 * Every external credential is optional at the module level so that the app boots
 * and renders in every environment. Each consumer is responsible for degrading
 * gracefully (see `src/lib/datasources/*`), and the UI surfaces the resulting
 * data provenance so a user is never shown fabricated data without a label.
 */

function env(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function flag(name: string): boolean {
  const value = env(name)?.toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

/**
 * FORTYGUARD_API_KEY — without it the FortyGuard client cannot reach the live
 * Temperature API and automatically falls back to the deterministic simulator in
 * `src/lib/fortyguard/mock.ts`. Everything downstream (hotspots, factors,
 * recommendations, reports) still works, but the UI is flagged as "Demo data".
 */
export const FORTYGUARD_API_KEY = env("FORTYGUARD_API_KEY");

export const FORTYGUARD_BASE_URL =
  env("FORTYGUARD_BASE_URL") ?? "https://api.fortyguard.com/v1";

/**
 * Force the simulator on even when a key is present. Useful for local UI work
 * and for demos where burning API credits is undesirable.
 */
export const FORTYGUARD_MOCK_MODE =
  flag("FORTYGUARD_MOCK_MODE") || !FORTYGUARD_API_KEY;

/**
 * CENSUS_API_KEY — required for the American Community Survey calls that power
 * the Heat Vulnerability Score. Without it the vulnerability panel renders an
 * "unavailable" state (or clearly-labelled demo values when demo mode is on)
 * and vulnerability is dropped from the severity weighting.
 */
export const CENSUS_API_KEY = env("CENSUS_API_KEY");

/**
 * ANTHROPIC_API_KEY / GEMINI_API_KEY — optional. Only used to phrase the already-computed
 * structured findings into prose. Without it `generateInsights` falls back to a
 * deterministic template. No numbers ever originate from the model.
 */
export const ANTHROPIC_API_KEY = env("ANTHROPIC_API_KEY");
export const ANTHROPIC_MODEL = env("ANTHROPIC_MODEL") ?? "claude-sonnet-4-5";

export const GEMINI_API_KEY = env("GEMINI_API_KEY");
export const GEMINI_MODEL = env("GEMINI_MODEL") ?? "gemini-3.6-flash";

/**
 * Vercel KV / Upstash Redis REST credentials. Vercel injects the `KV_*` names
 * when a KV store is linked to the project; Upstash's own dashboard uses the
 * `UPSTASH_*` names. Either works. Without them the cache falls back to a
 * per-instance in-memory LRU (plus a filesystem tier during local development).
 */
export const KV_REST_API_URL =
  env("KV_REST_API_URL") ?? env("UPSTASH_REDIS_REST_URL");
export const KV_REST_API_TOKEN =
  env("KV_REST_API_TOKEN") ?? env("UPSTASH_REDIS_REST_TOKEN");

/**
 * Enables clearly-labelled synthetic values for any data source whose credential
 * is missing, so the product can be demonstrated end to end. When disabled,
 * missing credentials produce an honest "unavailable" state instead.
 */
export const DEMO_MODE = env("DEMO_MODE") ? flag("DEMO_MODE") : true;

export const CONTACT_EMAIL = env("NEXT_PUBLIC_CONTACT_EMAIL");

/** Public-health heat thresholds, in degrees Celsius. */
export const HEAT_THRESHOLDS = {
  /** NWS "Caution" territory; the FortyGuard default exceedance threshold. */
  caution: 30,
  /** Sustained exposure above this is where heat illness risk climbs sharply. */
  extremeCaution: 32.2,
  /** NWS "Danger" band. */
  danger: 39.4,
} as const;

/** Default threshold used for exceedance / persistence analytics. */
export const DEFAULT_EXCEEDANCE_THRESHOLD_C = HEAT_THRESHOLDS.extremeCaution;

/**
 * The FortyGuard API Basic plan caps heatmap generation at 10 mi². We keep a
 * small safety margin so rounding in the AOI builder can never trip a 400.
 */
export const MAX_AOI_SQ_MILES = 9.5;

/** Earliest date this product exposes. The API itself accepts 2019-01-01 onward. */
export const MIN_HISTORICAL_DATE = "2021-01-01";

/** FortyGuard forecasts up to 12 hours beyond the current time. */
export const FORECAST_HORIZON_HOURS = 12;

/** Allowed spatial resolutions, in metres. */
export const GRANULARITIES = [60, 80, 100] as const;
export type Granularity = (typeof GRANULARITIES)[number];

export const DEFAULT_GRANULARITY: Granularity = 100;

/** How many hotspots we surface and enrich with contributing-factor sampling. */
export const MAX_HOTSPOTS = 5;

export const CACHE_TTL_SECONDS = {
  /** Historical temperature never changes; keep it for a month. */
  historical: 60 * 60 * 24 * 30,
  /** Near-real-time observations settle within the hour. */
  current: 60 * 30,
  /** Forecasts are re-issued frequently. */
  forecast: 60 * 20,
  /** Census tract demographics update annually. */
  demographics: 60 * 60 * 24 * 30,
  /** NLCD land-cover rasters are published on a multi-year cadence. */
  landCover: 60 * 60 * 24 * 90,
  /** NASA POWER climatology backfills slowly. */
  climatology: 60 * 60 * 24 * 7,
  /** A completed analysis document, retrievable by id for report export. */
  analysis: 60 * 60 * 24 * 7,
} as const;
