import { HEAT_THRESHOLDS } from "@/lib/config";
import type { Hotspot } from "@/lib/types";

/**
 * Composite hotspot severity, 0–100.
 *
 * Four terms, each normalised to 0–1 before weighting:
 *
 *   Thermal intensity  — how far above the local baseline this cluster sits.
 *                        Relative, so it works in any climate or season.
 *   Exposure duration  — hours above the heat-risk threshold. Duration is what
 *                        turns discomfort into hospitalisation, which is why
 *                        FortyGuard's exceedance layer is weighted this heavily
 *                        rather than treated as a footnote to the snapshot.
 *   Absolute heat      — where the peak sits against NWS heat-risk bands. A
 *                        cluster 3 °C above baseline matters far more at 41 °C
 *                        than at 24 °C.
 *   Vulnerability      — who is actually exposed.
 *
 * When a term is unavailable (no exceedance layer, or no Census key) its weight
 * is redistributed across the remaining terms instead of being scored as zero,
 * which would understate severity. `severityBreakdown` reports the weights that
 * were actually applied, so the UI can show exactly how a score was formed.
 */

const WEIGHTS = {
  intensity: 0.3,
  duration: 0.25,
  absolute: 0.15,
  vulnerability: 0.3,
} as const;

/** A z-score at or above this is treated as maximal thermal intensity. */
const MAX_Z = 3;
/** Fallback window length when the caller does not supply one. */
const DEFAULT_EXPOSURE_WINDOW_HOURS = 12;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function absoluteHeatScore(peakTempC: number): number {
  const floor = HEAT_THRESHOLDS.caution;
  const ceiling = HEAT_THRESHOLDS.danger + 3;
  return clamp01((peakTempC - floor) / (ceiling - floor));
}

export interface SeverityInput {
  zScore: number;
  peakTempC: number;
  exceedanceHours?: number;
  /** Length of the window exceedance was measured over, so the term saturates correctly. */
  exposureWindowHours?: number;
  vulnerabilityScore?: number;
}

export interface SeverityOutput {
  score: number;
  tier: Hotspot["severityTier"];
  breakdown: Hotspot["severityBreakdown"];
}

export function scoreSeverity(input: SeverityInput): SeverityOutput {
  const terms: { label: string; weight: number; normalized: number }[] = [
    {
      label: "Thermal intensity vs. area baseline",
      weight: WEIGHTS.intensity,
      normalized: clamp01(input.zScore / MAX_Z),
    },
    {
      label: "Absolute heat vs. health thresholds",
      weight: WEIGHTS.absolute,
      normalized: absoluteHeatScore(input.peakTempC),
    },
  ];

  if (input.exceedanceHours !== undefined) {
    const windowHours = input.exposureWindowHours ?? DEFAULT_EXPOSURE_WINDOW_HOURS;
    terms.push({
      label: "Hours above heat-risk threshold",
      weight: WEIGHTS.duration,
      normalized: clamp01(input.exceedanceHours / Math.max(1, windowHours)),
    });
  }

  if (input.vulnerabilityScore !== undefined) {
    terms.push({
      label: "Population vulnerability",
      weight: WEIGHTS.vulnerability,
      normalized: clamp01(input.vulnerabilityScore / 100),
    });
  }

  const weightTotal = terms.reduce((acc, t) => acc + t.weight, 0);
  const score = terms.reduce(
    (acc, t) => acc + (t.weight / weightTotal) * t.normalized,
    0,
  );

  const finalScore = Math.round(score * 100);

  return {
    score: finalScore,
    tier:
      finalScore >= 70 ? "critical" : finalScore >= 50 ? "high" : finalScore >= 32 ? "moderate" : "watch",
    breakdown: terms.map((t) => ({
      label: t.label,
      weight: Math.round((t.weight / weightTotal) * 100) / 100,
      normalized: Math.round(t.normalized * 1000) / 1000,
    })),
  };
}
