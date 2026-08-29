import type { LatLng } from "@/lib/types";

/**
 * Short, scannable place labels relative to the analysed area centre.
 *
 * The UI never shows a street paragraph when a two-word zone name will do.
 * Names are claimed uniquely so two hotspots do not both become "central area".
 */

const CARDINALS: { min: number; max: number; names: string[] }[] = [
  { min: -22.5, max: 22.5, names: ["northern section", "northern edge"] },
  { min: 22.5, max: 67.5, names: ["northeast quadrant", "northeast corner"] },
  { min: 67.5, max: 112.5, names: ["eastern corridor", "eastern edge"] },
  { min: 112.5, max: 157.5, names: ["southeast quadrant", "southeast corner"] },
  { min: 157.5, max: 180, names: ["southern boundary", "southern edge"] },
  { min: -180, max: -157.5, names: ["southern boundary", "southern edge"] },
  { min: -157.5, max: -112.5, names: ["southwest corner", "southwest edge"] },
  { min: -112.5, max: -67.5, names: ["western district", "western edge"] },
  { min: -67.5, max: -22.5, names: ["northwest quadrant", "northwest edge"] },
];

export function bearingDegrees(origin: LatLng, point: LatLng): number {
  const dLat = point.lat - origin.lat;
  const dLng = (point.lng - origin.lng) * Math.cos((origin.lat * Math.PI) / 180);
  return (Math.atan2(dLng, dLat) * 180) / Math.PI;
}

export function planarDistanceDeg(origin: LatLng, point: LatLng): number {
  const dLat = point.lat - origin.lat;
  const dLng = (point.lng - origin.lng) * Math.cos((origin.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

function namesFor(origin: LatLng, point: LatLng): string[] {
  const dist = planarDistanceDeg(origin, point);
  if (dist < 0.0022) return ["central area", "inner core"];

  const bearing = bearingDegrees(origin, point);
  const match = CARDINALS.find((c) => bearing >= c.min && bearing < c.max);
  return match?.names ?? ["central area"];
}

/** Claim a unique zone name for `point` relative to `origin`. */
export function claimZoneName(
  origin: LatLng,
  point: LatLng,
  used: Set<string>,
): string {
  const candidates = [...namesFor(origin, point), "central area", "inner core"];
  for (const name of candidates) {
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  const fallback = `${candidates[0]} ${used.size + 1}`;
  used.add(fallback);
  return fallback;
}
