import type { BoundingBox, LatLng } from "@/lib/types";
import { MAX_AOI_SQ_MILES } from "@/lib/config";

const EARTH_RADIUS_M = 6_378_137;
const SQ_METERS_PER_SQ_MILE = 2_589_988.11;

export function degreesLatPerMeter(): number {
  return 1 / ((Math.PI / 180) * EARTH_RADIUS_M);
}

export function degreesLngPerMeter(lat: number): number {
  const scale = Math.cos((lat * Math.PI) / 180);
  return 1 / ((Math.PI / 180) * EARTH_RADIUS_M * Math.max(scale, 1e-6));
}

/** Square bounding box centred on `center` with `radiusMeters` half-width. */
export function boxAround(center: LatLng, radiusMeters: number): BoundingBox {
  const dLat = radiusMeters * degreesLatPerMeter();
  const dLng = radiusMeters * degreesLngPerMeter(center.lat);
  return {
    west: center.lng - dLng,
    south: center.lat - dLat,
    east: center.lng + dLng,
    north: center.lat + dLat,
  };
}

export function boxCenter(box: BoundingBox): LatLng {
  return {
    lat: (box.north + box.south) / 2,
    lng: (box.east + box.west) / 2,
  };
}

/** Equirectangular approximation — accurate well past the scale of a city AOI. */
export function boxAreaSqMeters(box: BoundingBox): number {
  const midLat = (box.north + box.south) / 2;
  const heightM = (box.north - box.south) / degreesLatPerMeter();
  const widthM = (box.east - box.west) / degreesLngPerMeter(midLat);
  return Math.abs(heightM * widthM);
}

export function sqMetersToSqMiles(sqMeters: number): number {
  return sqMeters / SQ_METERS_PER_SQ_MILE;
}

export function sqMilesToSqMeters(sqMiles: number): number {
  return sqMiles * SQ_METERS_PER_SQ_MILE;
}

/**
 * Shrink a requested radius so the resulting square AOI stays inside the plan's
 * maximum heatmap area. FortyGuard rejects oversized polygons with a 400, and a
 * rejected request is a wasted round trip rather than a wasted credit, but the
 * user experience of a silent failure is worse than a slightly smaller AOI.
 */
export function clampRadiusToPlanLimit(center: LatLng, radiusMeters: number): number {
  const maxSideMeters = Math.sqrt(sqMilesToSqMeters(MAX_AOI_SQ_MILES));
  const maxRadius = maxSideMeters / 2;
  const requested = Math.max(150, radiusMeters);
  if (requested <= maxRadius) return requested;
  void center;
  return maxRadius;
}

/** Closed GeoJSON ring, [lng, lat] order, first point repeated last. */
export function boxToRing(box: BoundingBox): [number, number][] {
  return [
    [box.west, box.south],
    [box.east, box.south],
    [box.east, box.north],
    [box.west, box.north],
    [box.west, box.south],
  ];
}

export function boxToFeatureCollection(box: BoundingBox) {
  return {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "Polygon" as const,
          coordinates: [boxToRing(box)],
        },
      },
    ],
  };
}

export function ringCentroid(ring: [number, number][]): LatLng {
  const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1)
    : ring;
  if (pts.length === 0) return { lat: 0, lng: 0 };
  let lng = 0;
  let lat = 0;
  for (const [x, y] of pts) {
    lng += x;
    lat += y;
  }
  return { lat: lat / pts.length, lng: lng / pts.length };
}

export function ringBox(ring: [number, number][]): BoundingBox {
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const [x, y] of ring) {
    if (x < west) west = x;
    if (x > east) east = x;
    if (y < south) south = y;
    if (y > north) north = y;
  }
  return { west, south, east, north };
}

export function mergeBoxes(boxes: BoundingBox[]): BoundingBox {
  return boxes.reduce((acc, b) => ({
    west: Math.min(acc.west, b.west),
    south: Math.min(acc.south, b.south),
    east: Math.max(acc.east, b.east),
    north: Math.max(acc.north, b.north),
  }));
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Rough continental-US bounds including Alaska and Hawaii. FortyGuard, the
 * Census APIs and NLCD are all US-only, so rejecting out-of-country input early
 * gives a far better error than a downstream 400.
 */
export function isWithinUnitedStates(point: LatLng): boolean {
  const { lat, lng } = point;
  const conus = lat >= 24.3 && lat <= 49.5 && lng >= -125.1 && lng <= -66.8;
  const alaska = lat >= 51.0 && lat <= 71.5 && lng >= -179.9 && lng <= -129.0;
  const hawaii = lat >= 18.8 && lat <= 22.4 && lng >= -160.3 && lng <= -154.6;
  const prVi = lat >= 17.6 && lat <= 18.6 && lng >= -67.4 && lng <= -64.5;
  return conus || alaska || hawaii || prVi;
}

/** Deterministic key fragment for a box, rounded so nearby AOIs share cache entries. */
export function boxCacheKey(box: BoundingBox, precision = 4): string {
  const r = (n: number) => n.toFixed(precision);
  return `${r(box.west)}_${r(box.south)}_${r(box.east)}_${r(box.north)}`;
}
