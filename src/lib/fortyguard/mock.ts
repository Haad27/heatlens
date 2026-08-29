import type { BoundingBox } from "@/lib/types";
import { degreesLatPerMeter, degreesLngPerMeter } from "@/lib/geo";
import type {
  FgEnvParamsRequest,
  FgEnvParamsResult,
  FgFeatureCollection,
  FgHeatmapRequest,
  FgHeatmapResult,
} from "@/lib/fortyguard/types";

/**
 * Deterministic urban-heat simulator used when no FortyGuard API key is
 * configured, or when FORTYGUARD_MOCK_MODE is set.
 *
 * It emits the same wire shape the live API returns, so `client.ts` runs the
 * identical normalisation path in both modes — the only difference downstream is
 * the provenance label, which the UI always shows as "Demo data".
 *
 * The field is not random noise dressed up as temperature. It composes:
 *   - a seasonal + diurnal baseline driven by latitude and timestamp,
 *   - a coherent multi-octave "built surface" field standing in for impervious
 *     cover and building density,
 *   - an anti-correlated canopy field,
 *   - a small number of strong thermal cores (rail yards, big-box retail roofs,
 *     industrial parcels) that produce the clustered hotspots the detector is
 *     meant to find.
 *
 * Everything is seeded from the AOI and timestamp, so the same query always
 * yields the same map. A demo that shifts under the user is worse than no demo.
 */

function hash2(x: number, y: number, seed: number): number {
  let h = seed ^ (x * 374761393) ^ (y * 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function stringSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smoothstep(x - xi);
  const yf = smoothstep(y - yi);
  const v00 = hash2(xi, yi, seed);
  const v10 = hash2(xi + 1, yi, seed);
  const v01 = hash2(xi, yi + 1, seed);
  const v11 = hash2(xi + 1, yi + 1, seed);
  const top = v00 + (v10 - v00) * xf;
  const bottom = v01 + (v11 - v01) * xf;
  return top + (bottom - top) * yf;
}

function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += amplitude * valueNoise(x * frequency, y * frequency, seed + i * 7919);
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / norm;
}

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  return Math.floor((date.getTime() - start) / 86_400_000);
}

/**
 * Regional 2 m air temperature before any urban effect: a latitude-dependent
 * annual mean, a seasonal sinusoid peaking in late July, and a diurnal curve
 * peaking mid-afternoon.
 */
function baselineTemperatureC(lat: number, timestamp: Date, seed: number): number {
  const annualMean = 27 - Math.abs(lat - 25) * 0.55;
  const seasonalAmplitude = 6 + Math.max(0, lat - 25) * 0.42;
  const doy = dayOfYear(timestamp);
  const seasonal = Math.cos(((doy - 205) / 365) * 2 * Math.PI) * seasonalAmplitude;

  const hour = timestamp.getUTCHours() + timestamp.getUTCMinutes() / 60;
  const solarHour = (hour + lat * 0 + 24) % 24;
  const diurnal = -Math.cos(((solarHour - 3) / 24) * 2 * Math.PI) * 5.2;

  const synopticOffset = (hash2(Math.round(lat * 10), doy, seed) - 0.5) * 5.5;

  return annualMean + seasonal + diurnal + synopticOffset;
}

function diurnalOffsetC(hour: number): number {
  return -Math.cos(((hour - 3) / 24) * 2 * Math.PI) * 5.2;
}

interface SurfaceSample {
  /** 0–1 proxy for impervious cover and building mass. */
  built: number;
  /** 0–1 canopy fraction. */
  canopy: number;
  /** Additional degrees from localised thermal cores. */
  coreBoost: number;
}

function sampleSurface(
  u: number,
  v: number,
  seed: number,
  cores: { u: number; v: number; strength: number; radius: number }[],
): SurfaceSample {
  const built = Math.min(1, Math.max(0, fbm(u * 5.5, v * 5.5, seed) * 1.25 - 0.1));
  const canopyRaw = fbm(u * 4.2 + 31.7, v * 4.2 + 11.3, seed + 5171);
  const canopy = Math.min(1, Math.max(0, canopyRaw * 0.9 - built * 0.55 + 0.18));

  let coreBoost = 0;
  for (const core of cores) {
    const d = Math.hypot(u - core.u, v - core.v);
    coreBoost += core.strength * Math.exp(-(d * d) / (2 * core.radius * core.radius));
  }

  return { built, canopy, coreBoost };
}

function buildCores(seed: number) {
  const count = 3 + Math.floor(hash2(11, 13, seed) * 3);
  const cores: { u: number; v: number; strength: number; radius: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    cores.push({
      u: 0.12 + hash2(i, 101, seed) * 0.76,
      v: 0.12 + hash2(i, 211, seed) * 0.76,
      strength: 1.8 + hash2(i, 307, seed) * 3.4,
      radius: 0.07 + hash2(i, 409, seed) * 0.1,
    });
  }
  return cores;
}

interface MockGridOptions {
  box: BoundingBox;
  granularityMeters: number;
  timestamp: Date;
  analyticType: "tcm" | "time_of_measure" | "exceedance" | "persistence";
  thresholdC: number;
  direction: "above" | "below";
  /** Window used by exceedance/persistence, inclusive start, exclusive end. */
  hourWindow: [number, number];
  seedSource: string;
}

interface MockTile {
  ring: [number, number][];
  value: number;
  lat: number;
  lng: number;
}

function buildTiles(options: MockGridOptions): MockTile[] {
  const { box, granularityMeters, timestamp, analyticType, thresholdC, direction, hourWindow } =
    options;
  const seed = stringSeed(options.seedSource);
  const cores = buildCores(seed);

  const midLat = (box.north + box.south) / 2;
  const stepLat = granularityMeters * degreesLatPerMeter();
  const stepLng = granularityMeters * degreesLngPerMeter(midLat);

  const rows = Math.max(4, Math.min(90, Math.round((box.north - box.south) / stepLat)));
  const cols = Math.max(4, Math.min(90, Math.round((box.east - box.west) / stepLng)));
  const dLat = (box.north - box.south) / rows;
  const dLng = (box.east - box.west) / cols;

  const base = baselineTemperatureC(midLat, timestamp, seed);
  const baseAtNoonReference = base - diurnalOffsetC(timestamp.getUTCHours());

  const tiles: MockTile[] = [];

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const south = box.south + r * dLat;
      const north = south + dLat;
      const west = box.west + c * dLng;
      const east = west + dLng;
      const u = (c + 0.5) / cols;
      const v = (r + 0.5) / rows;

      const surface = sampleSurface(u, v, seed, cores);
      const uhi =
        surface.built * 4.6 - surface.canopy * 3.4 + surface.coreBoost +
        (hash2(r, c, seed) - 0.5) * 0.55;

      let value: number;
      if (analyticType === "tcm") {
        value = base + uhi;
      } else if (analyticType === "time_of_measure") {
        value = Math.round(14 + surface.built * 3 - surface.canopy * 1.2);
      } else {
        const [startHour, endHour] = hourWindow;
        let hours = 0;
        let bestRun = 0;
        let run = 0;
        for (let h = startHour; h < endHour; h += 1) {
          const hourly = baseAtNoonReference + diurnalOffsetC(h % 24) + uhi;
          const passes = direction === "above" ? hourly > thresholdC : hourly < thresholdC;
          if (passes) {
            hours += 1;
            run += 1;
            bestRun = Math.max(bestRun, run);
          } else {
            run = 0;
          }
        }
        value = analyticType === "exceedance" ? hours : bestRun;
      }

      tiles.push({
        ring: [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south],
        ],
        value: Math.round(value * 100) / 100,
        lat: (north + south) / 2,
        lng: (east + west) / 2,
      });
    }
  }

  return tiles;
}

function statsFrom(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / Math.max(1, values.length);
  return {
    Minimum: sorted[0] ?? 0,
    Maximum: sorted[sorted.length - 1] ?? 0,
    Mean: Math.round(mean * 100) / 100,
    Standard_deviation: Math.round(Math.sqrt(variance) * 100) / 100,
  };
}

function frequencyFrom(values: number[]): Record<string, number> {
  const freq: Record<string, number> = {};
  for (const v of values) {
    const bucket = Math.round(v * 2) / 2;
    const key = bucket.toFixed(1);
    freq[key] = (freq[key] ?? 0) + 1;
  }
  return freq;
}

export function mockHeatmapResult(
  request: FgHeatmapRequest,
  box: BoundingBox,
  timestamp: Date,
): FgHeatmapResult {
  const analyticType = request.analytic_type ?? "tcm";
  const thresholdC = request.threshold ?? 30;
  const direction = request.direction ?? "above";

  let hourWindow: [number, number] = [0, 24];
  if (request.date_time.filter_type === 2 && request.date_time.start_time && request.date_time.end_time) {
    const start = Number(request.date_time.start_time.slice(0, 2));
    const end = Number(request.date_time.end_time.slice(0, 2));
    hourWindow = [start, Math.max(start + 1, end)];
  } else if (request.date_time.filter_type === 1 && request.date_time.start_time) {
    const start = Number(request.date_time.start_time.slice(0, 2));
    hourWindow = [start, start + 1];
  }

  const tiles = buildTiles({
    box,
    granularityMeters: request.granularity,
    timestamp,
    analyticType,
    thresholdC,
    direction,
    hourWindow,
    seedSource: `${box.west.toFixed(3)}|${box.south.toFixed(3)}|${box.east.toFixed(3)}|${box.north.toFixed(3)}`,
  });

  const values = tiles.map((t) => t.value);

  const mapData: FgFeatureCollection = {
    type: "FeatureCollection",
    features: tiles.map((tile) => ({
      type: "Feature" as const,
      properties: {
        temperature: tile.value,
        value: tile.value,
        latitude: tile.lat,
        longitude: tile.lng,
      },
      geometry: {
        type: "Polygon",
        coordinates: [tile.ring],
      },
    })),
  };

  return {
    map_data: mapData,
    stats_data: {
      Temperature_stats: statsFrom(values),
      Overall_temperature_distribution: [...values].sort((a, b) => a - b),
      Temperature_frequency: frequencyFrom(values),
      units: analyticType === "tcm" ? "celsius" : "hour",
    },
  };
}

export function mockEnvParamsResult(request: FgEnvParamsRequest): FgEnvParamsResult {
  const seed = stringSeed(
    `${request.latitude.toFixed(3)}|${request.longitude.toFixed(3)}|${request.date_time.start_date}`,
  );

  const startHour = Number((request.date_time.start_time ?? "00:00").slice(0, 2));
  const endHour =
    request.date_time.filter_type === 2 && request.date_time.end_time
      ? Number(request.date_time.end_time.slice(0, 2))
      : request.date_time.filter_type === 3
        ? 23
        : startHour;

  const timestamps: string[] = [];
  const heatIndex: number[] = [];
  const apparent: number[] = [];
  const humidity: number[] = [];

  const anchorHour = startHour;
  const anchorOffset = diurnalOffsetC(anchorHour);

  for (let h = startHour; h <= endHour; h += 1) {
    const hour = ((h % 24) + 24) % 24;
    const airTemp = request.temperature - anchorOffset + diurnalOffsetC(hour);
    const rh = Math.min(
      95,
      Math.max(18, 68 - (airTemp - 24) * 2.4 + (hash2(hour, 7, seed) - 0.5) * 9),
    );
    const humidityLoad = Math.max(0, rh - 40) / 60;
    const hi = airTemp + Math.max(0, airTemp - 26) * humidityLoad * 1.35;

    timestamps.push(
      `${request.date_time.start_date}T${String(hour).padStart(2, "0")}:00:00+00:00`,
    );
    heatIndex.push(Math.round(hi * 10) / 10);
    apparent.push(Math.round((airTemp + (hi - airTemp) * 0.72) * 10) / 10);
    humidity.push(Math.round(rh));
  }

  return {
    metadata: {
      timezone: "UTC",
      timezone_offset_hours: 0,
      time_range: {
        start: timestamps[0],
        end: timestamps[timestamps.length - 1],
        interval: "1h",
        count: timestamps.length,
      },
      timestamps,
    },
    locations: [
      {
        lat: request.latitude,
        lon: request.longitude,
        temperature: request.temperature,
        parameters: {
          heat_index_celsius: heatIndex,
          apparent_temperature_celsius: apparent,
          relative_humidity_percent: humidity,
        },
      },
    ],
  };
}
