/**
 * Temperature and severity colour scales.
 *
 * The temperature ramp is ColorBrewer RdYlBu reversed — a diverging blue →
 * yellow → red scale that is distinguishable under deuteranopia, protanopia and
 * tritanopia. Red/green ramps are the obvious choice for heat and the wrong one:
 * roughly one in twelve men cannot read them.
 *
 * The scale is anchored to the data range rather than to absolute temperature,
 * because the interesting signal is intra-urban contrast. Absolute health
 * thresholds are marked separately on the legend so the reader still knows where
 * the dangerous bands sit.
 */

const TEMPERATURE_RAMP = [
  "#1e4680",
  "#2f72b2",
  "#4ba3c7",
  "#6ec6b8",
  "#aee09e",
  "#fee08b",
  "#fdae61",
  "#f46d43",
  "#d73027",
  "#a50026",
] as const;

/** Sequential ramp for hour counts (exceedance / persistence). */
const DURATION_RAMP = [
  "#ffffcc",
  "#ffeda0",
  "#fed976",
  "#feb24c",
  "#fd8d3c",
  "#fc4e2a",
  "#e31a1c",
  "#bd0026",
  "#800026",
] as const;

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[r, g, b].map((c) => clamp(c).toString(16).padStart(2, "0")).join("")}`;
}

function interpolate(ramp: readonly string[], t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  if (ramp.length === 1) return ramp[0];
  const scaled = clamped * (ramp.length - 1);
  const index = Math.min(ramp.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const from = hexToRgb(ramp[index]);
  const to = hexToRgb(ramp[index + 1]);
  return rgbToHex([
    from[0] + (to[0] - from[0]) * local,
    from[1] + (to[1] - from[1]) * local,
    from[2] + (to[2] - from[2]) * local,
  ]);
}

export interface ColorScale {
  min: number;
  max: number;
  colorFor: (value: number) => string;
  stops: { offset: number; color: string; value: number }[];
}

export function buildTemperatureScale(min: number, max: number): ColorScale {
  const dataSpan = max - min;
  const mid = (min + max) / 2;

  let lo: number;
  let hi: number;

  if (dataSpan < 4.0) {
    // When the temperature spread across the area is narrow or uniform (e.g. not too hot nor too cool),
    // anchor the scale around standard ambient reference levels (~18°C cool to ~34°C hot, with ~26°C sweet spot)
    // so moderate / sweet-spot areas display the pleasant moderate yellow/green color instead of collapsing to dark blue.
    const naturalT = Math.max(0.15, Math.min(0.85, (mid - 18) / 16));
    const targetSpan = Math.max(4.0, Math.max(0.5, dataSpan));
    lo = mid - naturalT * targetSpan;
    hi = lo + targetSpan;
  } else {
    lo = min;
    hi = max;
  }

  return {
    min: lo,
    max: hi,
    colorFor: (value: number) => interpolate(TEMPERATURE_RAMP, (value - lo) / (hi - lo)),
    stops: TEMPERATURE_RAMP.map((color, index) => ({
      offset: index / (TEMPERATURE_RAMP.length - 1),
      color,
      value: lo + ((hi - lo) * index) / (TEMPERATURE_RAMP.length - 1),
    })),
  };
}

export function buildDurationScale(min: number, max: number): ColorScale {
  const lo = Math.min(0, min);
  const hi = Math.max(lo + 1, max);
  return {
    min: lo,
    max: hi,
    colorFor: (value: number) => interpolate(DURATION_RAMP, (value - lo) / (hi - lo)),
    stops: DURATION_RAMP.map((color, index) => ({
      offset: index / (DURATION_RAMP.length - 1),
      color,
      value: lo + ((hi - lo) * index) / (DURATION_RAMP.length - 1),
    })),
  };
}

export const SEVERITY_COLORS = {
  critical: "#a50026",
  high: "#e34a33",
  moderate: "#f2a541",
  watch: "#6a9fb5",
} as const;

export const SEVERITY_LABELS = {
  critical: "Critical",
  high: "High",
  moderate: "Moderate",
  watch: "Watch",
} as const;

export const VULNERABILITY_COLORS = {
  severe: "#7b2d8b",
  elevated: "#a95aa1",
  moderate: "#cf9fd0",
  low: "#e3d5ea",
} as const;

export const CONTRIBUTION_COLORS = {
  high: "#b2182b",
  medium: "#ef8a62",
  low: "#c7cdd6",
} as const;
