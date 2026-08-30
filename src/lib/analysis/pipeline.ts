import { randomUUID } from "node:crypto";
import {
  CACHE_TTL_SECONDS,
  DEFAULT_EXCEEDANCE_THRESHOLD_C,
  DEFAULT_GRANULARITY,
  FORECAST_HORIZON_HOURS,
  FORTYGUARD_MOCK_MODE,
  MAX_HOTSPOTS,
  MIN_HISTORICAL_DATE,
} from "@/lib/config";
import { cacheKey, cacheSet } from "@/lib/cache";
import {
  boxAround,
  boxAreaSqMeters,
  clampRadiusToPlanLimit,
  isWithinUnitedStates,
  sqMetersToSqMiles,
} from "@/lib/geo";
import {
  fetchEnvParams,
  fetchHeatGrid,
  getForecast,
  hourRange,
  singleHour,
} from "@/lib/fortyguard/client";
import { FortyGuardError } from "@/lib/fortyguard/types";
import { reverseGeocodeLabel, tractForPoint } from "@/lib/datasources/geocoder";
import { fetchTractDemographics } from "@/lib/datasources/census";
import { profileLandCover } from "@/lib/datasources/landcover";
import { fetchClimateTrend } from "@/lib/datasources/nasaPower";
import { detectCoolZones, detectHotspots, sampleLayerWithin } from "@/lib/analysis/hotspots";
import {
  applyForecastRecommendationWindows,
  computeForecastInsight,
} from "@/lib/analysis/forecast";
import { buildContributingFactors } from "@/lib/analysis/factors";
import { buildVulnerability } from "@/lib/analysis/vulnerability";
import { scoreSeverity } from "@/lib/analysis/severity";
import { buildRecommendations } from "@/lib/analysis/recommendations";
import { buildBrief, toCoolZone } from "@/lib/analysis/brief";
import { claimZoneName } from "@/lib/analysis/placeNames";
import { generateInsights } from "@/lib/generateInsights";
import {
  floorToHour,
  formatLocalLabel,
  localParts,
  localToUtc,
  timeZoneFor,
  utcParts,
} from "@/lib/time";
import type {
  AnalysisRequest,
  AnalysisResult,
  CoolZone,
  HeatGrid,
  Hotspot,
  HourlyProfile,
  HourlySample,
  Provenance,
} from "@/lib/types";

/**
 * The analysis pipeline.
 *
 * Ordering matters here for both latency and cost:
 *
 *  1. Three FortyGuard layers are requested in parallel — the temperature
 *     snapshot plus exceedance and persistence over the surrounding day.
 *     Snapshot alone would answer "how hot is it now"; exceedance and
 *     persistence answer "how long is it dangerous for", which is the question
 *     a heat-response plan is actually built around.
 *  2. Hotspots are detected from the snapshot, then the other layers are
 *     sampled within each hotspot footprint. No extra API calls.
 *  3. Per-hotspot enrichment (land cover, census tract, reverse geocode) runs
 *     concurrently across hotspots, and the AOI-level context (hourly profile,
 *     multi-year trend) runs concurrently with it.
 *  4. The narrative layer runs last, over finished numbers.
 *
 * A failure in any supporting source degrades that section only. A failure in
 * the FortyGuard snapshot is fatal, because without temperature there is
 * nothing to analyse.
 */

export class AnalysisError extends Error {
  readonly statusCode: number;
  readonly hint?: string;

  constructor(message: string, statusCode = 400, hint?: string) {
    super(message);
    this.name = "AnalysisError";
    this.statusCode = statusCode;
    this.hint = hint;
  }
}

interface ResolvedTime {
  instant: Date;
  timeZone: string;
  label: string;
  /** UTC date/time strings handed to FortyGuard. */
  utcDate: string;
  utcTime: string;
  /** Local hour, used to label charts. */
  localHour: number;
  localDate: string;
}

function resolveTime(request: AnalysisRequest): ResolvedTime {
  const timeZone = timeZoneFor(request.center);
  const now = new Date();

  let instant: Date;

  if (request.mode === "forecast") {
    const offset = Math.min(
      FORECAST_HORIZON_HOURS,
      Math.max(0, Math.round(request.forecastOffsetHours ?? 3)),
    );
    instant = floorToHour(new Date(now.getTime() + offset * 3_600_000));
  } else if (request.mode === "current") {
    instant = floorToHour(new Date(now.getTime() - 3_600_000));
  } else {
    if (!request.date) {
      throw new AnalysisError("A date is required for historical analysis.", 400);
    }
    if (request.date < MIN_HISTORICAL_DATE) {
      throw new AnalysisError(
        `Historical data in this product starts at ${MIN_HISTORICAL_DATE}.`,
        400,
        "Pick a date from 2021 onward.",
      );
    }
    instant = localToUtc(request.date, request.time ?? "15:00", timeZone);

    const latestAllowed = new Date(now.getTime() + FORECAST_HORIZON_HOURS * 3_600_000);
    if (instant > latestAllowed) {
      throw new AnalysisError(
        "That date and time is more than 12 hours in the future.",
        400,
        "FortyGuard forecasts up to 12 hours ahead. Use the Forecast mode for future times.",
      );
    }
  }

  const utc = utcParts(instant);
  const local = localParts(instant, timeZone);

  return {
    instant,
    timeZone,
    label: formatLocalLabel(instant, timeZone),
    utcDate: utc.date,
    utcTime: utc.time,
    localHour: local.hour,
    localDate: local.date,
  };
}

function ttlFor(mode: AnalysisRequest["mode"]): number {
  if (mode === "historical") return CACHE_TTL_SECONDS.historical;
  if (mode === "forecast") return CACHE_TTL_SECONDS.forecast;
  return CACHE_TTL_SECONDS.current;
}

/**
 * Exceedance and persistence describe a window, not an instant.
 *
 * FortyGuard's filter_type 2 range must fall inside a single UTC day, and every
 * US time zone is behind UTC, so a local afternoon always sits at the *end* of
 * the UTC day. The window is therefore anchored a few hours before the analysed
 * hour and runs to the end of the UTC day, which lands on the local peak-heat
 * period — the hours that actually matter for heat illness.
 */
function exposureWindow(
  utcHour: number,
  instant: Date,
  timeZone: string,
): { start: string; end: string; hours: number; localLabel: string } {
  const pad = (n: number) => `${String(n).padStart(2, "0")}:00`;
  const startHour = Math.max(0, Math.min(utcHour - 5, 23));
  const endHour = Math.min(23, startHour + 12);

  const dayStart = new Date(instant);
  dayStart.setUTCHours(startHour, 0, 0, 0);
  const dayEnd = new Date(instant);
  dayEnd.setUTCHours(endHour, 0, 0, 0);

  const fmt = (date: Date) =>
    new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: true }).format(date);

  return {
    start: pad(startHour),
    end: pad(endHour),
    hours: endHour - startHour,
    localLabel: `${fmt(dayStart)}–${fmt(dayEnd)} local`,
  };
}

async function buildHourlyProfile(
  center: { lat: number; lng: number },
  anchorTempC: number,
  resolved: ResolvedTime,
  ttl: number,
): Promise<HourlyProfile> {
  try {
    const series = await fetchEnvParams({
      point: center,
      temperatureC: anchorTempC,
      dateTime: hourRange(resolved.utcDate, "00:00", "23:00"),
      observedAt: resolved.instant.toISOString(),
      ttlSeconds: ttl,
    });

    const nowMs = Date.now();
    const samples: HourlySample[] = series.timestamps.map((timestamp, index) => {
      const parsed = new Date(timestamp);
      const valid = !Number.isNaN(parsed.getTime());
      const localHour = valid
        ? Number(localParts(parsed, resolved.timeZone).hour)
        : index;
      return {
        timestamp: valid ? parsed.toISOString() : timestamp,
        hourLocal: localHour,
        heatIndexC: series.heatIndexC[index] ?? undefined,
        apparentTempC: series.apparentTempC[index] ?? undefined,
        relativeHumidityPct: series.relativeHumidityPct[index] ?? undefined,
        isForecast: valid ? parsed.getTime() > nowMs : false,
      };
    });

    return { samples, provenance: series.provenance, timezone: resolved.timeZone };
  } catch (error) {
    return {
      samples: [],
      timezone: resolved.timeZone,
      provenance: {
        status: "unavailable",
        source: "FortyGuard Temperature API — Environmental Parameters",
        fetchedAt: new Date().toISOString(),
        note: "The hourly heat-index series could not be retrieved for this location and time.",
      },
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function enrichHotspot(
  base: ReturnType<typeof detectHotspots>["clusters"][number],
  rank: number,
  exceedanceGrid: HeatGrid | undefined,
  persistenceGrid: HeatGrid | undefined,
  exposureWindowHours: number,
): Promise<Hotspot> {
  const [landCover, addressLabel, tract] = await Promise.all([
    profileLandCover(base.bbox).catch(() => null),
    reverseGeocodeLabel(base.center).catch(() => null),
    tractForPoint(base.center).catch(() => null),
  ]);

  const demographics = tract ? await fetchTractDemographics(tract).catch(() => null) : null;
  const vulnerability = demographics
    ? buildVulnerability(demographics, base.areaSqMeters)
    : null;

  const factors = landCover ? buildContributingFactors(landCover) : [];

  const exceedanceHours = sampleLayerWithin(exceedanceGrid, base.bbox, "mean");
  const persistenceHours = sampleLayerWithin(persistenceGrid, base.bbox, "mean");

  const severity = scoreSeverity({
    zScore: base.zScore,
    peakTempC: base.peakValue,
    exceedanceHours,
    exposureWindowHours,
    vulnerabilityScore: vulnerability?.score,
  });

  const partial = {
    anomalyC: base.anomaly,
    peakTempC: base.peakValue,
    exceedanceHours,
    persistenceHours,
    areaSqMeters: base.areaSqMeters,
    severityScore: severity.score,
  };

  const recommendations = buildRecommendations(partial, factors, vulnerability, {
    waterSharePct: landCover?.waterSharePct ?? null,
    vegetatedSharePct: landCover?.vegetatedSharePct ?? null,
  });

  return {
    id: `hotspot-${rank}`,
    rank,
    center: base.center,
    bbox: base.bbox,
    polygon: base.polygon,
    areaSqMeters: base.areaSqMeters,
    tileCount: base.tiles.length,
    meanTempC: base.meanValue,
    peakTempC: base.peakValue,
    anomalyC: base.anomaly,
    zScore: base.zScore,
    exceedanceHours,
    persistenceHours,
    severityScore: severity.score,
    severityTier: severity.tier,
    severityBreakdown: severity.breakdown,
    factors,
    vulnerability,
    recommendations,
    addressLabel: addressLabel ?? undefined,
  };
}

/**
 * Groups provenance entries that describe the same upstream service, so a
 * source split across several endpoints is not penalised once per endpoint.
 */
function provenanceFamily(source: string): string {
  return source.split(/\s+[—-]\s+/)[0].replace(/\s*\(simulated\)$/i, "").trim();
}

function collectProvenance(result: {
  grid: HeatGrid;
  exceedanceGrid?: HeatGrid;
  hotspots: Hotspot[];
  hourlyProfile: HourlyProfile;
  climateTrend: AnalysisResult["climateTrend"];
}): Provenance[] {
  const seen = new Map<string, Provenance>();
  const add = (p?: Provenance) => {
    if (!p) return;
    const key = `${p.source}|${p.status}`;
    if (!seen.has(key)) seen.set(key, p);
  };

  add(result.grid.provenance);
  add(result.exceedanceGrid?.provenance);
  add(result.hourlyProfile.provenance);
  add(result.climateTrend.provenance);
  for (const hotspot of result.hotspots) {
    add(hotspot.factors[0]?.provenance);
    add(hotspot.vulnerability?.provenance);
  }

  return [...seen.values()];
}

function assessConfidence(
  provenance: Provenance[],
  hotspotCount: number,
): AnalysisResult["dataQuality"] {
  const caveats: string[] = [];
  let confidence = 1;

  const penalised = new Set<string>();

  for (const entry of provenance) {
    if (entry.status !== "demo" && entry.status !== "unavailable") continue;
    const family = provenanceFamily(entry.source);
    if (penalised.has(family)) continue;
    penalised.add(family);

    if (entry.status === "demo") {
      confidence -= 0.3;
      caveats.push(`${family} is running on simulated data, not measurements.`);
    } else {
      confidence -= 0.15;
      caveats.push(`${family} was unavailable, so that layer is missing.`);
    }
  }

  if (hotspotCount === 0) {
    caveats.push("No statistically distinct hotspots were detected in this area.");
  }

  confidence = Math.max(0.15, Math.min(1, confidence));

  return {
    provenance,
    confidence: Math.round(confidence * 100) / 100,
    confidenceLabel: confidence >= 0.8 ? "high" : confidence >= 0.5 ? "moderate" : "indicative",
    caveats,
  };
}

export async function runAnalysis(request: AnalysisRequest): Promise<AnalysisResult> {
  const startedAt = Date.now();

  if (!isWithinUnitedStates(request.center)) {
    throw new AnalysisError(
      "This location is outside the United States.",
      400,
      "FortyGuard coverage and the Census and NLCD context layers are US-only in this release. Try a US address.",
    );
  }

  const radiusMeters = clampRadiusToPlanLimit(request.center, request.radiusMeters);
  const box = boxAround(request.center, radiusMeters);
  const granularity = request.granularity ?? DEFAULT_GRANULARITY;
  const thresholdC = request.thresholdC ?? DEFAULT_EXCEEDANCE_THRESHOLD_C;
  const resolved = resolveTime(request);
  const ttl = ttlFor(request.mode);
  const window = exposureWindow(
    Number(resolved.utcTime.slice(0, 2)),
    resolved.instant,
    resolved.timeZone,
  );

  const snapshotQuery = {
    box,
    dateTime: singleHour(resolved.utcDate, resolved.utcTime),
    granularity,
    layer: "tcm" as const,
    observedAt: resolved.instant.toISOString(),
    ttlSeconds: ttl,
  };

  // 12-hour forecast is additive and never blocks the historical snapshot.
  // Started here so it overlaps the heatmap + enrichment work; a failure
  // simply omits the Thermal Overview forecast block.
  const forecastPromise = getForecast(box, FORECAST_HORIZON_HOURS, {
    granularity,
    timeZone: resolved.timeZone,
  });

  const [grid, exceedanceGrid, persistenceGrid] = await Promise.all([
    fetchHeatGrid(snapshotQuery),
    fetchHeatGrid({
      box,
      dateTime: hourRange(resolved.utcDate, window.start, window.end),
      granularity,
      layer: "exceedance",
      thresholdC,
      direction: "above",
      observedAt: resolved.instant.toISOString(),
      ttlSeconds: ttl,
    }).catch(() => undefined),
    fetchHeatGrid({
      box,
      dateTime: hourRange(resolved.utcDate, window.start, window.end),
      granularity,
      layer: "persistence",
      thresholdC,
      direction: "above",
      observedAt: resolved.instant.toISOString(),
      ttlSeconds: ttl,
    }).catch(() => undefined),
  ]);

  let finalGrid = grid;
  let finalExceedanceGrid = exceedanceGrid;
  let finalPersistenceGrid = persistenceGrid;

  if (!finalGrid.tiles.length && (request.mode === "current" || request.mode === "forecast")) {
    console.log(`   ℹ️ [FortyGuard] Real-time observation unavailable for ${resolved.utcDate}. Fetching latest verified satellite record (2024-07-15 15:00)...`);
    const fallbackDate = "2024-07-15";
    const fallbackTime = "15:00";
    const fallbackObservedAt = new Date("2024-07-15T19:00:00.000Z").toISOString();

    const [fbGrid, fbExceedance, fbPersistence] = await Promise.all([
      fetchHeatGrid({
        box,
        dateTime: singleHour(fallbackDate, fallbackTime),
        granularity,
        layer: "tcm",
        observedAt: fallbackObservedAt,
        ttlSeconds: CACHE_TTL_SECONDS.historical,
      }),
      fetchHeatGrid({
        box,
        dateTime: hourRange(fallbackDate, "10:00", "19:00"),
        granularity,
        layer: "exceedance",
        thresholdC,
        direction: "above",
        observedAt: fallbackObservedAt,
        ttlSeconds: CACHE_TTL_SECONDS.historical,
      }).catch(() => undefined),
      fetchHeatGrid({
        box,
        dateTime: hourRange(fallbackDate, "10:00", "19:00"),
        granularity,
        layer: "persistence",
        thresholdC,
        direction: "above",
        observedAt: fallbackObservedAt,
        ttlSeconds: CACHE_TTL_SECONDS.historical,
      }).catch(() => undefined),
    ]);

    if (fbGrid.tiles.length > 0) {
      finalGrid = fbGrid;
      finalExceedanceGrid = fbExceedance;
      finalPersistenceGrid = fbPersistence;
    }
  }

  if (!finalGrid.tiles.length) {
    throw new AnalysisError(
      "No temperature data was returned for this area at this date and time.",
      404,
      "FortyGuard covers US records from 2021 to 2024. Pick a date like 2024-07-15 in the Historical tab.",
    );
  }

  const detection = detectHotspots(finalGrid, MAX_HOTSPOTS);
  const coolDetection = detectCoolZones(finalGrid, 4);
  const usedCoolNames = new Set<string>();
  const namedCoolClusters = coolDetection.clusters.map((cluster, index) => ({
    cluster,
    index,
    name: claimZoneName(request.center, cluster.center, usedCoolNames),
  }));

  const [hotspots, coolZones, aoiLandCover, hourlyProfile, climateTrend, forecastResult] =
    await Promise.all([
      Promise.all(
        detection.clusters.map((cluster, index) =>
          enrichHotspot(cluster, index + 1, finalExceedanceGrid, finalPersistenceGrid, window.hours),
        ),
      ),
      Promise.all(
        namedCoolClusters.map(async ({ cluster, index, name }) => {
          const landCover = await profileLandCover(cluster.bbox).catch(() => null);
          return toCoolZone(`cool-${index + 1}`, name, cluster, landCover);
        }),
      ),
      profileLandCover(box).catch(() => null),
      buildHourlyProfile(request.center, finalGrid.stats.mean, resolved, ttl),
      fetchClimateTrend(request.center, thresholdC),
      forecastPromise,
    ]);

  hotspots.sort((a, b) => b.severityScore - a.severityScore);
  hotspots.forEach((hotspot, index) => {
    hotspot.rank = index + 1;
    hotspot.id = `hotspot-${index + 1}`;
  });

  const forecast = computeForecastInsight(forecastResult?.hours ?? [], thresholdC);
  applyForecastRecommendationWindows(hotspots, forecast);

  const areaSqMeters = boxAreaSqMeters(box);
  const aboveThreshold = finalGrid.tiles.filter((t) => t.value >= thresholdC).length;

  const vegetationCoveragePct = Math.round(
    aoiLandCover?.treeCanopyPct ?? aoiLandCover?.vegetatedSharePct ?? 0,
  );
  const buildingDensityPct = Math.round(
    aoiLandCover?.builtDensityPct ?? aoiLandCover?.imperviousPct ?? 0,
  );

  const summary: AnalysisResult["summary"] = {
    meanTempC: Math.round(finalGrid.stats.mean * 10) / 10,
    peakTempC: Math.round(finalGrid.stats.max * 10) / 10,
    minTempC: Math.round(finalGrid.stats.min * 10) / 10,
    shareAboveThreshold: Math.round((aboveThreshold / finalGrid.tiles.length) * 1000) / 1000,
    heatGapC: Math.round((finalGrid.stats.max - finalGrid.stats.min) * 10) / 10,
    areaSqMiles: Math.round(sqMetersToSqMiles(areaSqMeters) * 100) / 100,
    tileCount: finalGrid.tiles.length,
    granularityMeters: granularity,
    thresholdC,
    vegetationCoveragePct,
    buildingDensityPct,
  };

  const placeLabel =
    request.placeLabel ??
    (await reverseGeocodeLabel(request.center).catch(() => null)) ??
    `${request.center.lat.toFixed(4)}, ${request.center.lng.toFixed(4)}`;

  const brief = buildBrief({
    origin: request.center,
    hotspots,
    coolZones: coolZones as CoolZone[],
    aoiLandCover,
    heatGapC: summary.heatGapC,
    forecast,
  });

  const insights = await generateInsights({
    placeLabel,
    timestampLabel: resolved.label,
    mode: request.mode,
    summary,
    hotspots,
    isDemoData: FORTYGUARD_MOCK_MODE,
    exposureWindowLabel: window.localLabel,
  });

  const provenance = collectProvenance({
    grid,
    exceedanceGrid,
    hotspots,
    hourlyProfile,
    climateTrend,
  });

  const dataQuality = assessConfidence(provenance, hotspots.length);
  if (detection.note) dataQuality.caveats.unshift(detection.note);

  const result: AnalysisResult = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    request: { ...request, radiusMeters, granularity, thresholdC },
    resolvedDateTime: {
      timestamp: resolved.instant.toISOString(),
      label: resolved.label,
      mode: request.mode,
    },
    exposureWindow: { hours: window.hours, localLabel: window.localLabel },
    detectionThresholdZ: detection.zThresholdUsed,
    bbox: box,
    placeLabel,
    summary,
    grid,
    exceedanceGrid,
    persistenceGrid,
    hotspots,
    coolZones,
    brief,
    hourlyProfile,
    climateTrend,
    insights,
    dataQuality,
    computeMs: Date.now() - startedAt,
  };

  await cacheSet(cacheKey("analysis", [result.id]), result, CACHE_TTL_SECONDS.analysis);

  return result;
}

export async function loadAnalysis(id: string): Promise<AnalysisResult | null> {
  const { cacheGet } = await import("@/lib/cache");
  const hit = await cacheGet<AnalysisResult>(
    cacheKey("analysis", [id]),
    CACHE_TTL_SECONDS.analysis,
  );
  return hit?.value ?? null;
}

/**
 * Single-layer fetch used by the forecast time slider.
 *
 * Each hour is a separate FortyGuard submission, so hours are fetched lazily as
 * the user scrubs rather than pre-fetching all twelve. Combined with caching,
 * a user who looks at three hours pays for three hours.
 */
export async function fetchForecastLayer(
  center: { lat: number; lng: number },
  radiusMeters: number,
  offsetHours: number,
  granularity = DEFAULT_GRANULARITY,
): Promise<{ grid: HeatGrid; timestamp: string; label: string }> {
  if (!isWithinUnitedStates(center)) {
    throw new AnalysisError("This location is outside the United States.", 400);
  }

  const clampedOffset = Math.min(FORECAST_HORIZON_HOURS, Math.max(0, Math.round(offsetHours)));
  const timeZone = timeZoneFor(center);
  const instant = floorToHour(new Date(Date.now() + clampedOffset * 3_600_000));
  const utc = utcParts(instant);
  const box = boxAround(center, clampRadiusToPlanLimit(center, radiusMeters));

  const grid = await fetchHeatGrid({
    box,
    dateTime: singleHour(utc.date, utc.time),
    granularity,
    layer: "tcm",
    observedAt: instant.toISOString(),
    ttlSeconds: CACHE_TTL_SECONDS.forecast,
  });

  return {
    grid,
    timestamp: instant.toISOString(),
    label: formatLocalLabel(instant, timeZone),
  };
}

export function toApiError(error: unknown): {
  status: number;
  body: { error: string; hint?: string; code?: string };
} {
  if (error instanceof AnalysisError) {
    return {
      status: error.statusCode,
      body: { error: error.message, hint: error.hint, code: "ANALYSIS_ERROR" },
    };
  }
  if (error instanceof FortyGuardError) {
    return {
      status: error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 502,
      body: { error: error.message, hint: error.hint, code: "FORTYGUARD_ERROR" },
    };
  }
  return {
    status: 500,
    body: {
      error: "Something went wrong while running this analysis.",
      hint: "Try again in a moment. If it persists, check the server logs for the underlying cause.",
      code: "UNKNOWN",
    },
  };
}
