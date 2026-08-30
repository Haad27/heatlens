import type { ForecastHourlyTemp, ForecastInsight, ForecastTrend, Hotspot } from "@/lib/types";
import { formatClockHourLong } from "@/lib/format";

/**
 * Deterministic 12-hour forecast math.
 *
 * No model, no randomness: given hourly AOI mean/max temperatures, this
 * produces the sparkline series, the peak hour, the threshold count, the
 * trend label, and the single sentence shown under the Thermal Overview card.
 */

export interface ForecastHourInput {
  timestamp: string;
  hourLocal: number;
  meanTemp: number;
  maxTemp: number;
}

const TREND_DELTA_C = 0.5;
/** Stamp a deploy-before-peak window on misting / shade when heat persists this long. */
export const FORECAST_WINDOW_HOURS = 4;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function forecastTrend(meanTemps: number[]): ForecastTrend {
  if (meanTemps.length < 4) return "steady";
  const n = Math.min(3, Math.floor(meanTemps.length / 2));
  const first = average(meanTemps.slice(0, n));
  const last = average(meanTemps.slice(-n));
  const delta = last - first;
  if (delta > TREND_DELTA_C) return "rising";
  if (delta < -TREND_DELTA_C) return "falling";
  return "steady";
}

export function forecastSentence(input: {
  hoursAboveThreshold: number;
  peakHour: string;
  peakTempC: number;
}): string {
  if (input.hoursAboveThreshold > 0) {
    return `Peak heat expected around ${input.peakHour} (${input.peakTempC.toFixed(1)}°C) — exceeds the extreme-heat threshold for ~${input.hoursAboveThreshold} hours.`;
  }
  return "Temperatures are expected to stay below the extreme-heat threshold over the next 12 hours.";
}

export function computeForecastInsight(
  hours: ForecastHourInput[],
  thresholdC: number,
): ForecastInsight | null {
  const usable = hours.filter(
    (h) => Number.isFinite(h.meanTemp) && Number.isFinite(h.maxTemp),
  );
  if (usable.length < 3) return null;

  const hourlyMeanTemps: ForecastHourlyTemp[] = usable.map((h) => ({
    hour: formatClockHourLong(h.hourLocal),
    hourLocal: h.hourLocal,
    meanTemp: round1(h.meanTemp),
    maxTemp: round1(h.maxTemp),
  }));

  let peak = hourlyMeanTemps[0];
  for (const hour of hourlyMeanTemps) {
    if (hour.maxTemp > peak.maxTemp) peak = hour;
  }

  const hoursAboveThreshold = hourlyMeanTemps.filter((h) => h.maxTemp > thresholdC).length;
  const trend = forecastTrend(hourlyMeanTemps.map((h) => h.meanTemp));
  const peakHour = peak.hour;
  const peakTempC = peak.maxTemp;

  return {
    hourlyMeanTemps,
    peakHour,
    peakTempC,
    hoursAboveThreshold,
    trend,
    sentence: forecastSentence({ hoursAboveThreshold, peakHour, peakTempC }),
    thresholdC,
  };
}

/**
 * Additive stamp only — does not change which recommendation rules fire.
 * When the AOI is forecast to sit above the extreme-heat threshold for long
 * enough, misting and shade become time-sensitive: deploy them before the peak.
 */
export function applyForecastRecommendationWindows(
  hotspots: Hotspot[],
  forecast: ForecastInsight | null,
): void {
  if (!forecast || forecast.hoursAboveThreshold < FORECAST_WINDOW_HOURS) return;
  const window = `before ${forecast.peakHour}`;
  for (const hotspot of hotspots) {
    for (const rec of hotspot.recommendations) {
      if (rec.id === "misting-systems" || rec.id === "shade-structures") {
        rec.recommendedWindow = window;
      }
    }
  }
}
