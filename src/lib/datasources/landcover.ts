import { CACHE_TTL_SECONDS } from "@/lib/config";
import { cacheKey, cached } from "@/lib/cache";
import { degreesLatPerMeter, degreesLngPerMeter } from "@/lib/geo";
import type { BoundingBox, LatLng, Provenance } from "@/lib/types";

/**
 * USGS / MRLC National Land Cover Database (NLCD).
 *
 * This is what supplies the "why is it hot here" evidence: tree canopy cover,
 * impervious surface fraction, and development intensity. Free, no API key, and
 * it is the reference land-cover dataset for the conterminous US, which matters
 * when a city planner asks where a number came from.
 *
 * Three rasters are sampled per point via WMS GetFeatureInfo, which returns the
 * exact cell value (as `PALETTE_INDEX`) rather than a styled colour:
 *
 *  - nlcd_tcc_conus_2021_v2021-4 — USFS Tree Canopy Cover, percent 0–100
 *  - NLCD_2021_Impervious_L48    — impervious surface, percent 0–100
 *  - NLCD_2021_Land_Cover_L48    — 20-class land cover, used for built density
 *
 * Note on the Tree Equity Score API: American Forests does not currently expose
 * a public Tree Equity Score API (api.treeequityscore.org returns 403 to
 * unauthenticated callers and there is no self-serve key). NLCD canopy cover is
 * used instead — it is the same underlying quantity, nationally consistent, and
 * genuinely keyless. See the README for how to plug TES in if you obtain access.
 */

const WMS_ENDPOINT = "https://www.mrlc.gov/geoserver/wms";
const MRLC_URL = "https://www.mrlc.gov/data";

const LAYERS = {
  treeCanopy: "mrlc_display:nlcd_tcc_conus_2021_v2021-4",
  impervious: "mrlc_display:NLCD_2021_Impervious_L48",
  landCover: "mrlc_display:NLCD_2021_Land_Cover_L48",
} as const;

const NLCD_VINTAGE = 2021;

/** NLCD Legend classes relevant to urban heat. */
const DEVELOPED_CLASSES = {
  openSpace: 21,
  lowIntensity: 22,
  mediumIntensity: 23,
  highIntensity: 24,
} as const;

const VEGETATED_CLASSES = new Set([41, 42, 43, 52, 71, 81, 82, 90, 95]);
const WATER_CLASSES = new Set([11, 12]);

export interface LandCoverSample {
  /** Percent tree canopy cover, 0–100. */
  treeCanopyPct: number | null;
  /** Percent impervious surface, 0–100. */
  imperviousPct: number | null;
  /** NLCD land cover class code. */
  landCoverClass: number | null;
}

export interface LandCoverProfile {
  treeCanopyPct: number | null;
  imperviousPct: number | null;
  /**
   * Share of samples in NLCD "Developed, Medium/High Intensity" — the classes
   * defined by 50–100% impervious cover, which is the closest nationally
   * consistent proxy for dense building mass.
   */
  builtDensityPct: number | null;
  vegetatedSharePct: number | null;
  waterSharePct: number | null;
  dominantClassLabel: string | null;
  sampleCount: number;
  provenance: Provenance;
}

const CLASS_LABELS: Record<number, string> = {
  11: "Open water",
  12: "Perennial ice/snow",
  21: "Developed, open space",
  22: "Developed, low intensity",
  23: "Developed, medium intensity",
  24: "Developed, high intensity",
  31: "Barren land",
  41: "Deciduous forest",
  42: "Evergreen forest",
  43: "Mixed forest",
  52: "Shrub/scrub",
  71: "Grassland/herbaceous",
  81: "Pasture/hay",
  82: "Cultivated crops",
  90: "Woody wetlands",
  95: "Emergent herbaceous wetlands",
};

async function getFeatureInfo(layer: string, point: LatLng): Promise<number | null> {
  const halfSpanDeg = 0.0004;
  const bbox = [
    point.lng - halfSpanDeg,
    point.lat - halfSpanDeg,
    point.lng + halfSpanDeg,
    point.lat + halfSpanDeg,
  ].join(",");

  const url = new URL(WMS_ENDPOINT);
  url.searchParams.set("service", "WMS");
  url.searchParams.set("version", "1.1.1");
  url.searchParams.set("request", "GetFeatureInfo");
  url.searchParams.set("layers", layer);
  url.searchParams.set("query_layers", layer);
  url.searchParams.set("srs", "EPSG:4326");
  url.searchParams.set("bbox", bbox);
  url.searchParams.set("width", "101");
  url.searchParams.set("height", "101");
  url.searchParams.set("x", "50");
  url.searchParams.set("y", "50");
  url.searchParams.set("info_format", "application/json");

  const res = await fetch(url, {
    signal: AbortSignal.timeout(9000),
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;

  const body = (await res.json()) as {
    features?: { properties?: Record<string, unknown> }[];
  };
  const properties = body.features?.[0]?.properties;
  if (!properties) return null;

  const raw =
    properties.PALETTE_INDEX ??
    properties.GRAY_INDEX ??
    Object.values(properties).find((v) => typeof v === "number");
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

async function samplePoint(point: LatLng): Promise<LandCoverSample> {
  return cached(
    cacheKey("nlcd", [point.lat.toFixed(4), point.lng.toFixed(4), NLCD_VINTAGE]),
    CACHE_TTL_SECONDS.landCover,
    async () => {
      const [treeCanopyPct, imperviousPct, landCoverClass] = await Promise.all([
        getFeatureInfo(LAYERS.treeCanopy, point).catch(() => null),
        getFeatureInfo(LAYERS.impervious, point).catch(() => null),
        getFeatureInfo(LAYERS.landCover, point).catch(() => null),
      ]);
      return { treeCanopyPct, imperviousPct, landCoverClass };
    },
  );
}

/**
 * Sample a small grid across a hotspot footprint and average.
 *
 * Five points (centre plus four quadrant centroids) rather than a dense grid:
 * each point costs three WMS round trips, and at 30 m raster resolution a
 * five-point sample already smooths out single-pixel artefacts across a typical
 * one-to-three hectare hotspot.
 */
export async function profileLandCover(box: BoundingBox): Promise<LandCoverProfile> {
  const midLat = (box.north + box.south) / 2;
  const midLng = (box.east + box.west) / 2;
  const quarterLat = (box.north - box.south) / 4;
  const quarterLng = (box.east - box.west) / 4;

  const points: LatLng[] = [
    { lat: midLat, lng: midLng },
    { lat: midLat - quarterLat, lng: midLng - quarterLng },
    { lat: midLat - quarterLat, lng: midLng + quarterLng },
    { lat: midLat + quarterLat, lng: midLng - quarterLng },
    { lat: midLat + quarterLat, lng: midLng + quarterLng },
  ];

  const samples = await Promise.all(points.map((p) => samplePoint(p).catch(() => null)));
  const valid = samples.filter((s): s is LandCoverSample => s !== null);

  const mean = (pick: (s: LandCoverSample) => number | null): number | null => {
    const values = valid.map(pick).filter((v): v is number => v !== null);
    if (!values.length) return null;
    return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
  };

  const classes = valid
    .map((s) => s.landCoverClass)
    .filter((v): v is number => v !== null);

  const shareOf = (predicate: (c: number) => boolean): number | null => {
    if (!classes.length) return null;
    return Math.round((classes.filter(predicate).length / classes.length) * 1000) / 10;
  };

  const dominant = classes.length
    ? classes
        .reduce<{ code: number; count: number }[]>((acc, code) => {
          const found = acc.find((e) => e.code === code);
          if (found) found.count += 1;
          else acc.push({ code, count: 1 });
          return acc;
        }, [])
        .sort((a, b) => b.count - a.count)[0].code
    : null;

  const anyData = valid.some(
    (s) => s.treeCanopyPct !== null || s.imperviousPct !== null || s.landCoverClass !== null,
  );

  const provenance: Provenance = anyData
    ? {
        status: "live",
        source: `USGS NLCD ${NLCD_VINTAGE} (MRLC)`,
        fetchedAt: new Date().toISOString(),
        observedAt: `${NLCD_VINTAGE}-01-01T00:00:00.000Z`,
        url: MRLC_URL,
        note: `Tree canopy, impervious surface and land cover sampled at ${valid.length} points across the hotspot.`,
      }
    : {
        status: "unavailable",
        source: `USGS NLCD ${NLCD_VINTAGE} (MRLC)`,
        fetchedAt: new Date().toISOString(),
        url: MRLC_URL,
        note: "The MRLC land-cover service did not respond. Contributing factors are unavailable for this hotspot.",
      };

  return {
    treeCanopyPct: mean((s) => s.treeCanopyPct),
    imperviousPct: mean((s) => s.imperviousPct),
    builtDensityPct: shareOf(
      (c) => c === DEVELOPED_CLASSES.mediumIntensity || c === DEVELOPED_CLASSES.highIntensity,
    ),
    vegetatedSharePct: shareOf((c) => VEGETATED_CLASSES.has(c)),
    waterSharePct: shareOf((c) => WATER_CLASSES.has(c)),
    dominantClassLabel: dominant !== null ? (CLASS_LABELS[dominant] ?? `Class ${dominant}`) : null,
    sampleCount: valid.length,
    provenance,
  };
}

/** Bounding box of a fixed radius around a point, for single-point profiling. */
export function boxAroundPoint(point: LatLng, radiusMeters: number): BoundingBox {
  const dLat = radiusMeters * degreesLatPerMeter();
  const dLng = radiusMeters * degreesLngPerMeter(point.lat);
  return {
    west: point.lng - dLng,
    south: point.lat - dLat,
    east: point.lng + dLng,
    north: point.lat + dLat,
  };
}
