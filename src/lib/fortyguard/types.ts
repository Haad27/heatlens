/**
 * Wire types for the FortyGuard Temperature API.
 *
 * Verified against the live documentation at https:
 * (Create Heatmap, Environmental Parameters, Check Status, Known Limitations).
 *
 * Discrepancies against the original project brief, noted here because the live
 * docs are the source of truth:
 *
 *  1. `polygon_aoi` must be a GeoJSON *FeatureCollection* wrapping a Polygon
 *     feature. The brief showed a bare `{"type": "Polygon", ...}` geometry,
 *     which the API rejects with 400.
 *  2. The supported history window starts at 2019-01-01, not 2021-01-01. This
 *     product intentionally exposes 2021 onward (see MIN_HISTORICAL_DATE), but
 *     the API itself will accept earlier dates.
 *  3. The Create Heatmap page documents `filter_type: 4` (range of days, up to
 *     one month) while the Known Limitations page states filter_type must be 1,
 *     2 or 3 — the docs contradict each other. We only use 1–3, and cap
 *     filter_type 2 at the documented 23-hour maximum.
 *  4. The status endpoint is `GET /v1/status/{activity_id}` and is shared by
 *     every submission endpoint. The brief referred to it only generically.
 *  5. The response envelope for errors is
 *     `{ error: true, status_code, details: { message } }`, which differs from
 *     the success envelope's top-level `message`.
 *  6. Tile-level property names inside `map_data` are not documented. The
 *     parser in `client.ts` therefore probes a set of plausible keys rather
 *     than assuming one.
 */

export interface FgEnvelope<T> {
  error: boolean;
  status_code: number;
  message?: string;
  details?: { message?: string };
  data?: T;
}

export interface FgSubmitData {
  activity_id: string;
}

export type FgStatus = "Processing" | "Completed" | "Failed" | string;

export interface FgStatusData<TResult> {
  activity_id: string;
  status: FgStatus;
  result?: TResult;
}

export interface FgTemperatureStats {
  Minimum?: number;
  Maximum?: number;
  Mean?: number;
  Standard_deviation?: number;
  [key: string]: number | undefined;
}

export interface FgStatsData {
  Temperature_stats?: FgTemperatureStats;
  Overall_temperature_distribution?: number[];
  Normal_temperature_distribution?: { x_axis?: number[]; y_axis?: number[] };
  Temperature_frequency?: Record<string, number> | { bins?: number[]; counts?: number[] };
  units?: string;
  [key: string]: unknown;
}

export interface FgGeoJsonFeature {
  type: "Feature";
  properties: Record<string, unknown> | null;
  geometry: {
    type: string;
    coordinates: unknown;
  } | null;
}

export interface FgFeatureCollection {
  type: "FeatureCollection";
  features: FgGeoJsonFeature[];
}

export interface FgHeatmapResult {
  map_data?: FgFeatureCollection | Record<string, unknown>;
  stats_data?: FgStatsData;
}

/** `filter_type` values accepted by every submission endpoint. */
export const FG_FILTER = {
  singleHour: 1,
  rangeOfHours: 2,
  singleDay: 3,
} as const;

export interface FgDateTime {
  start_date: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
  filter_type: number;
}

export interface FgHeatmapRequest {
  polygon_aoi: {
    type: "FeatureCollection";
    features: {
      type: "Feature";
      properties: Record<string, unknown>;
      geometry: { type: "Polygon"; coordinates: [number, number][][] };
    }[];
  };
  date_time: FgDateTime;
  granularity: number;
  analytic_type?: "tcm" | "time_of_measure" | "exceedance" | "persistence";
  threshold?: number;
  direction?: "above" | "below";
}

export interface FgEnvParamsRequest {
  latitude: number;
  longitude: number;
  temperature: number;
  date_time: FgDateTime;
  analysis?: string[];
}

export interface FgEnvParamsResult {
  metadata?: {
    timezone?: string;
    timezone_offset_hours?: number;
    time_range?: { start?: string; end?: string; interval?: string; count?: number };
    timestamps?: string[];
  };
  locations?: {
    lat?: number;
    lon?: number;
    elevation?: number;
    temperature?: number;
    parameters?: Record<string, (number | null)[]>;
    solar_irradiance?: {
      clear_sky?: { ghi?: number; dni?: number; dhi?: number };
      description?: string;
    };
  }[];
}

/**
 * Environmental parameters available on the API Basic plan, which is capped at
 * three per request. Ordered by usefulness for heat-risk work: heat index is
 * the metric public-health agencies actually issue advisories against.
 */
export const BASIC_PLAN_ENV_PARAMS = [
  "heat_index_celsius",
  "apparent_temperature_celsius",
  "relative_humidity_percent",
] as const;

export class FortyGuardError extends Error {
  readonly statusCode: number;
  readonly hint?: string;

  constructor(message: string, statusCode: number, hint?: string) {
    super(message);
    this.name = "FortyGuardError";
    this.statusCode = statusCode;
    this.hint = hint;
  }
}
