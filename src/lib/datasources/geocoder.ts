import { CACHE_TTL_SECONDS } from "@/lib/config";
import { cacheKey, cached } from "@/lib/cache";
import { isWithinUnitedStates } from "@/lib/geo";
import type { GeocodeResult, LatLng } from "@/lib/types";

/**
 * US geocoding.
 *
 * Two providers, in order:
 *
 *  1. US Census Bureau Geocoder — authoritative for US street addresses, free,
 *     no API key, and it returns the census tract in the same round trip, which
 *     saves a second call when building the vulnerability layer. It does not
 *     handle bare place names ("Phoenix", "the Tenderloin").
 *  2. OpenStreetMap Nominatim — covers place names, neighbourhoods and
 *     landmarks. Restricted to `countrycodes=us` and cached hard, since
 *     Nominatim's usage policy expects low volume and a real User-Agent.
 *
 * Neither requires a credential, so search always works.
 */

const CENSUS_GEOCODER = "https://geocoding.geo.census.gov/geocoder";
const NOMINATIM = "https://nominatim.openstreetmap.org";
const USER_AGENT = "HeatLens/1.0 (urban heat intelligence platform)";

interface CensusTractGeography {
  GEOID?: string;
  NAME?: string;
  BASENAME?: string;
  STATE?: string;
  COUNTY?: string;
  TRACT?: string;
  AREALAND?: string;
  INTPTLAT?: string;
  INTPTLON?: string;
}

interface CensusAddressMatch {
  matchedAddress?: string;
  coordinates?: { x: number; y: number };
  addressComponents?: { state?: string; city?: string };
  geographies?: Record<string, CensusTractGeography[]>;
}

function firstTract(
  geographies: Record<string, CensusTractGeography[]> | undefined,
): CensusTractGeography | undefined {
  if (!geographies) return undefined;
  return geographies["Census Tracts"]?.[0] ?? Object.values(geographies)[0]?.[0];
}

export interface TractIdentity {
  geoid: string;
  name: string;
  state: string;
  county: string;
  tract: string;
  /** Land area in square metres, from TIGER. Used for population density. */
  landAreaSqMeters: number;
}

function toTractIdentity(raw: CensusTractGeography | undefined): TractIdentity | null {
  if (!raw?.GEOID || !raw.STATE || !raw.COUNTY || !raw.TRACT) return null;
  return {
    geoid: raw.GEOID,
    name: raw.NAME ?? `Census Tract ${raw.BASENAME ?? raw.TRACT}`,
    state: raw.STATE,
    county: raw.COUNTY,
    tract: raw.TRACT,
    landAreaSqMeters: Number(raw.AREALAND ?? 0) || 0,
  };
}

/** Forward geocode a free-text US query. */
export async function geocode(query: string): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const coordinateMatch = parseCoordinatePair(trimmed);
  if (coordinateMatch) {
    return [
      {
        label: `${coordinateMatch.lat.toFixed(5)}, ${coordinateMatch.lng.toFixed(5)}`,
        center: coordinateMatch,
        kind: "coordinates",
      },
    ];
  }

  return cached(
    cacheKey("geocode", [trimmed.toLowerCase()]),
    CACHE_TTL_SECONDS.demographics,
    async () => {
      const [addresses, places] = await Promise.all([
        censusForward(trimmed).catch(() => []),
        nominatimForward(trimmed).catch(() => []),
      ]);

      const combined = [...addresses, ...places];
      const seen = new Set<string>();
      return combined
        .filter((r) => isWithinUnitedStates(r.center))
        .filter((r) => {
          const key = `${r.center.lat.toFixed(4)},${r.center.lng.toFixed(4)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 6);
    },
  );
}

function parseCoordinatePair(input: string): LatLng | null {
  const match = input.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

async function censusForward(query: string): Promise<GeocodeResult[]> {
  const url = new URL(`${CENSUS_GEOCODER}/locations/onelineaddress`);
  url.searchParams.set("address", query);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("format", "json");

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) return [];

  const body = (await res.json()) as { result?: { addressMatches?: CensusAddressMatch[] } };
  return (body.result?.addressMatches ?? []).slice(0, 4).map((match) => ({
    label: match.matchedAddress ?? query,
    center: { lat: match.coordinates?.y ?? 0, lng: match.coordinates?.x ?? 0 },
    kind: "address",
    state: match.addressComponents?.state,
  }));
}

async function nominatimForward(query: string): Promise<GeocodeResult[]> {
  const url = new URL(`${NOMINATIM}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("countrycodes", "us");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) return [];

  const body = (await res.json()) as {
    lat: string;
    lon: string;
    display_name: string;
    addresstype?: string;
    address?: { state?: string; county?: string };
  }[];

  return body.map((item) => ({
    label: item.display_name.replace(/, United States$/, ""),
    center: { lat: Number(item.lat), lng: Number(item.lon) },
    kind: item.addresstype ?? "place",
    state: item.address?.state,
    county: item.address?.county,
  }));
}

/** Reverse geocode a point to its census tract. No API key required. */
export async function tractForPoint(point: LatLng): Promise<TractIdentity | null> {
  return cached(
    cacheKey("tract", [point.lat.toFixed(4), point.lng.toFixed(4)]),
    CACHE_TTL_SECONDS.demographics,
    async () => {
      const url = new URL(`${CENSUS_GEOCODER}/geographies/coordinates`);
      url.searchParams.set("x", String(point.lng));
      url.searchParams.set("y", String(point.lat));
      url.searchParams.set("benchmark", "Public_AR_Current");
      url.searchParams.set("vintage", "Current_Current");
      url.searchParams.set("layers", "Census Tracts");
      url.searchParams.set("format", "json");

      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(9000),
        cache: "no-store",
      });
      if (!res.ok) return null;

      const body = (await res.json()) as {
        result?: { geographies?: Record<string, CensusTractGeography[]> };
      };
      return toTractIdentity(firstTract(body.result?.geographies));
    },
  );
}

/** Nearest street address for a point, used to label hotspots. */
export async function reverseGeocodeLabel(point: LatLng): Promise<string | null> {
  return cached(
    cacheKey("revgeo", [point.lat.toFixed(4), point.lng.toFixed(4)]),
    CACHE_TTL_SECONDS.demographics,
    async () => {
      try {
        const url = new URL(`${NOMINATIM}/reverse`);
        url.searchParams.set("lat", String(point.lat));
        url.searchParams.set("lon", String(point.lng));
        url.searchParams.set("format", "jsonv2");
        url.searchParams.set("zoom", "17");

        const res = await fetch(url, {
          headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
          signal: AbortSignal.timeout(6000),
          cache: "no-store",
        });
        if (!res.ok) return null;

        const body = (await res.json()) as {
          name?: string;
          display_name?: string;
          address?: Record<string, string>;
        };
        const a = body.address ?? {};
        const street = [a.house_number, a.road].filter(Boolean).join(" ");
        const locality = a.neighbourhood ?? a.suburb ?? a.city_district ?? a.city ?? a.town;
        const parts = [street || body.name, locality].filter(Boolean);
        return parts.length ? parts.join(", ") : (body.display_name ?? null);
      } catch {
        return null;
      }
    },
  );
}
