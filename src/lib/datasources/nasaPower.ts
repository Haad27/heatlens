import { CACHE_TTL_SECONDS, MIN_HISTORICAL_DATE } from "@/lib/config";
import { cacheKey, cached } from "@/lib/cache";
import type { ClimateTrend, ClimateTrendPoint, LatLng } from "@/lib/types";

/**
 * NASA POWER — daily meteorology, free and keyless.
 *
 * FortyGuard resolves heat at 60–100 m, which is what makes hotspot detection
 * possible, but querying it for a multi-year daily series would be enormously
 * expensive in credits. POWER is coarse (roughly half a degree) so it says
 * nothing about a single city block, but it is the right instrument for the
 * question "is this area's warm season trending hotter year over year", which is
 * the context a capital-planning decision needs.
 *
 * The two are deliberately kept separate in the UI: POWER supplies regional
 * trend, FortyGuard supplies the hyperlocal picture.
 */

const POWER_ENDPOINT = "https://power.larc.nasa.gov/api/temporal/daily/point";
const POWER_URL = "https://power.larc.nasa.gov/";
const FILL_VALUE = -999;

/** Northern-hemisphere warm season. Every US location sits in it. */
const WARM_SEASON_MONTHS = new Set([5, 6, 7, 8, 9]);

function formatPowerDate(date: Date): string {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;
}

/** Ordinary least squares slope of y over x. */
function linearSlope(points: { x: number; y: number }[]): number {
  if (points.length < 2) return 0;
  const n = points.length;
  const meanX = points.reduce((a, p) => a + p.x, 0) / n;
  const meanY = points.reduce((a, p) => a + p.y, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (const p of points) {
    numerator += (p.x - meanX) * (p.y - meanY);
    denominator += (p.x - meanX) ** 2;
  }
  return denominator === 0 ? 0 : numerator / denominator;
}

export async function fetchClimateTrend(
  point: LatLng,
  thresholdC: number,
): Promise<ClimateTrend> {
  const startDate = MIN_HISTORICAL_DATE.replace(/-/g, "");
  const end = new Date(Date.now() - 7 * 86_400_000);
  const endDate = formatPowerDate(end);

  let cacheAgeSeconds: number | undefined;

  const trend = await cached<ClimateTrend>(
    cacheKey("power", [point.lat.toFixed(2), point.lng.toFixed(2), thresholdC, endDate.slice(0, 6)]),
    CACHE_TTL_SECONDS.climatology,
    async () => {
      try {
        const url = new URL(POWER_ENDPOINT);
        url.searchParams.set("parameters", "T2M_MAX");
        url.searchParams.set("community", "RE");
        url.searchParams.set("latitude", point.lat.toFixed(4));
        url.searchParams.set("longitude", point.lng.toFixed(4));
        url.searchParams.set("start", startDate);
        url.searchParams.set("end", endDate);
        url.searchParams.set("format", "JSON");

        const res = await fetch(url, {
          signal: AbortSignal.timeout(20_000),
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`NASA POWER returned ${res.status}`);

        const body = (await res.json()) as {
          properties?: { parameter?: { T2M_MAX?: Record<string, number> } };
        };
        const series = body.properties?.parameter?.T2M_MAX;
        if (!series) throw new Error("NASA POWER returned no T2M_MAX series");

        const byYear = new Map<number, { values: number[]; aboveThreshold: number }>();

        for (const [key, value] of Object.entries(series)) {
          if (value === FILL_VALUE || !Number.isFinite(value)) continue;
          const year = Number(key.slice(0, 4));
          const month = Number(key.slice(4, 6));
          if (!WARM_SEASON_MONTHS.has(month)) continue;

          const bucket = byYear.get(year) ?? { values: [], aboveThreshold: 0 };
          bucket.values.push(value);
          if (value >= thresholdC) bucket.aboveThreshold += 1;
          byYear.set(year, bucket);
        }

        const points: ClimateTrendPoint[] = [...byYear.entries()]
          .filter(([, bucket]) => bucket.values.length >= 60)
          .sort((a, b) => a[0] - b[0])
          .map(([year, bucket]) => ({
            year,
            meanSummerMaxC:
              Math.round(
                (bucket.values.reduce((a, b) => a + b, 0) / bucket.values.length) * 10,
              ) / 10,
            daysAboveThreshold: bucket.aboveThreshold,
          }));

        return {
          points,
          thresholdC,
          trendCPerYear:
            Math.round(
              linearSlope(points.map((p) => ({ x: p.year, y: p.meanSummerMaxC }))) * 1000,
            ) / 1000,
          provenance: {
            status: "live",
            source: "NASA POWER (MERRA-2 reanalysis)",
            fetchedAt: new Date().toISOString(),
            url: POWER_URL,
            note: "Regional daily maximum air temperature, May–September. Roughly 50 km resolution — regional context, not block level.",
          },
        } satisfies ClimateTrend;
      } catch (error) {
        return {
          points: [],
          thresholdC,
          trendCPerYear: 0,
          provenance: {
            status: "unavailable",
            source: "NASA POWER (MERRA-2 reanalysis)",
            fetchedAt: new Date().toISOString(),
            url: POWER_URL,
            note: "The NASA POWER service could not be reached, so the multi-year trend is unavailable.",
          },
          error: error instanceof Error ? error.message : "Unknown error",
        } satisfies ClimateTrend;
      }
    },
    (age) => {
      cacheAgeSeconds = age;
    },
  );

  if (cacheAgeSeconds !== undefined && trend.provenance.status === "live") {
    return { ...trend, provenance: { ...trend.provenance, status: "cached" } };
  }
  return trend;
}
