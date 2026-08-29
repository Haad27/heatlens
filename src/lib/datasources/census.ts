import { CACHE_TTL_SECONDS, CENSUS_API_KEY, DEMO_MODE } from "@/lib/config";
import { cacheKey, cached } from "@/lib/cache";
import type { Provenance } from "@/lib/types";
import type { TractIdentity } from "@/lib/datasources/geocoder";

/**
 * US Census Bureau American Community Survey (ACS) 5-year estimates.
 *
 * Powers the "who is affected" layer. The five-year estimates are used rather
 * than one-year because they are published for every census tract in the
 * country, including small rural ones, where the one-year sample is suppressed.
 *
 * CENSUS_API_KEY is required — the ACS endpoint began rejecting keyless
 * requests with a "Missing Key" page. Without the key this module returns
 * clearly-labelled demo values (when DEMO_MODE is on) or an explicit
 * "unavailable" provenance, and `vulnerability.ts` drops the vulnerability term
 * from the severity weighting rather than inventing one.
 */

const ACS_YEARS = [2023, 2022, 2021] as const;
const ACS_BASE = "https://api.census.gov/data";
const ACS_DOCS = "https://www.census.gov/data/developers/data-sets/acs-5year.html";

/** Detailed-table variables, requested in a single call. */
const VARIABLES = {
  totalPopulation: "B01003_001E",
  medianHouseholdIncome: "B19013_001E",
  povertyUniverse: "B17001_001E",
  belowPoverty: "B17001_002E",
  vehicleUniverse: "B25044_001E",
  ownerNoVehicle: "B25044_003E",
  renterNoVehicle: "B25044_010E",
} as const;

/**
 * Sex-by-age cells covering ages 65 and over: male 65-66 through 85+, then the
 * matching female cells. ACS has no single "population 65+" cell in the
 * detailed tables, so they have to be summed.
 */
const AGE_65_PLUS = [
  "B01001_020E", "B01001_021E", "B01001_022E", "B01001_023E", "B01001_024E", "B01001_025E",
  "B01001_044E", "B01001_045E", "B01001_046E", "B01001_047E", "B01001_048E", "B01001_049E",
];

export interface TractDemographics {
  geoid: string;
  name: string;
  vintage: number;
  totalPopulation: number | null;
  population65Plus: number | null;
  percentOver65: number | null;
  percentBelowPoverty: number | null;
  percentNoVehicle: number | null;
  medianHouseholdIncome: number | null;
  populationDensityPerSqMi: number | null;
  landAreaSqMeters: number;
  provenance: Provenance;
}

function num(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= -100_000) return null;
  return value;
}

function pct(part: number | null, whole: number | null): number | null {
  if (part === null || whole === null || whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

async function fetchAcsYear(
  tract: TractIdentity,
  year: number,
): Promise<Record<string, string> | null> {
  const variables = [
    "NAME",
    ...Object.values(VARIABLES),
    ...AGE_65_PLUS,
  ];

  const url = new URL(`${ACS_BASE}/${year}/acs/acs5`);
  url.searchParams.set("get", variables.join(","));
  url.searchParams.set("for", `tract:${tract.tract}`);
  url.searchParams.set("in", `state:${tract.state} county:${tract.county}`);
  if (CENSUS_API_KEY) url.searchParams.set("key", CENSUS_API_KEY);

  const res = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;

  const text = await res.text();
  if (!text.trimStart().startsWith("[")) return null;

  const rows = JSON.parse(text) as string[][];
  if (rows.length < 2) return null;

  const [header, values] = rows;
  const record: Record<string, string> = {};
  header.forEach((key, index) => {
    record[key] = values[index];
  });
  return record;
}

function demoDemographics(tract: TractIdentity): TractDemographics {
  let seed = 0;
  for (let i = 0; i < tract.geoid.length; i += 1) {
    seed = (seed * 31 + tract.geoid.charCodeAt(i)) >>> 0;
  }
  const rand = (n: number) => ((seed >> (n * 3)) % 1000) / 1000;

  const totalPopulation = Math.round(1800 + rand(1) * 4200);
  const percentOver65 = Math.round((9 + rand(2) * 20) * 10) / 10;
  const percentBelowPoverty = Math.round((7 + rand(3) * 28) * 10) / 10;
  const percentNoVehicle = Math.round((10 + rand(4) * 45) * 10) / 10;
  const medianHouseholdIncome = Math.round(32_000 + rand(5) * 78_000);
  const landAreaSqMeters = tract.landAreaSqMeters || 900_000;

  return {
    geoid: tract.geoid,
    name: tract.name,
    vintage: ACS_YEARS[0],
    totalPopulation,
    population65Plus: Math.round((totalPopulation * percentOver65) / 100),
    percentOver65,
    percentBelowPoverty,
    percentNoVehicle,
    medianHouseholdIncome,
    populationDensityPerSqMi: Math.round(totalPopulation / (landAreaSqMeters / 2_589_988.11)),
    landAreaSqMeters,
    provenance: {
      status: "demo",
      source: "US Census Bureau ACS 5-year (simulated)",
      fetchedAt: new Date().toISOString(),
      url: ACS_DOCS,
      note: "Placeholder demographics. Add CENSUS_API_KEY for real American Community Survey figures.",
    },
  };
}

function unavailable(tract: TractIdentity, reason: string): TractDemographics {
  return {
    geoid: tract.geoid,
    name: tract.name,
    vintage: ACS_YEARS[0],
    totalPopulation: null,
    population65Plus: null,
    percentOver65: null,
    percentBelowPoverty: null,
    percentNoVehicle: null,
    medianHouseholdIncome: null,
    populationDensityPerSqMi: null,
    landAreaSqMeters: tract.landAreaSqMeters,
    provenance: {
      status: "unavailable",
      source: "US Census Bureau ACS 5-year",
      fetchedAt: new Date().toISOString(),
      url: ACS_DOCS,
      note: reason,
    },
  };
}

export async function fetchTractDemographics(
  tract: TractIdentity,
): Promise<TractDemographics> {
  if (!CENSUS_API_KEY) {
    return DEMO_MODE
      ? demoDemographics(tract)
      : unavailable(
          tract,
          "CENSUS_API_KEY is not set, so population vulnerability could not be retrieved.",
        );
  }

  let cacheAgeSeconds: number | undefined;

  const result = await cached<TractDemographics | null>(
    cacheKey("acs", [tract.geoid]),
    CACHE_TTL_SECONDS.demographics,
    async () => {
      for (const year of ACS_YEARS) {
        try {
          const record = await fetchAcsYear(tract, year);
          if (!record) continue;

          const totalPopulation = num(record[VARIABLES.totalPopulation]);
          const population65Plus = AGE_65_PLUS.reduce<number | null>((acc, variable) => {
            const value = num(record[variable]);
            if (acc === null || value === null) return acc === null ? value : acc;
            return acc + value;
          }, null);

          const belowPoverty = num(record[VARIABLES.belowPoverty]);
          const povertyUniverse = num(record[VARIABLES.povertyUniverse]);
          const vehicleUniverse = num(record[VARIABLES.vehicleUniverse]);
          const ownerNoVehicle = num(record[VARIABLES.ownerNoVehicle]);
          const renterNoVehicle = num(record[VARIABLES.renterNoVehicle]);
          const noVehicle =
            ownerNoVehicle !== null && renterNoVehicle !== null
              ? ownerNoVehicle + renterNoVehicle
              : null;

          const landAreaSqMeters = tract.landAreaSqMeters || 0;
          const densityPerSqMi =
            totalPopulation !== null && landAreaSqMeters > 0
              ? Math.round(totalPopulation / (landAreaSqMeters / 2_589_988.11))
              : null;

          return {
            geoid: tract.geoid,
            name: record.NAME ?? tract.name,
            vintage: year,
            totalPopulation,
            population65Plus,
            percentOver65: pct(population65Plus, totalPopulation),
            percentBelowPoverty: pct(belowPoverty, povertyUniverse),
            percentNoVehicle: pct(noVehicle, vehicleUniverse),
            medianHouseholdIncome: num(record[VARIABLES.medianHouseholdIncome]),
            populationDensityPerSqMi: densityPerSqMi,
            landAreaSqMeters,
            provenance: {
              status: "live",
              source: `US Census Bureau ACS 5-year (${year})`,
              fetchedAt: new Date().toISOString(),
              observedAt: `${year}-12-31T00:00:00.000Z`,
              url: ACS_DOCS,
              note: `${year - 4}–${year} five-year estimates for ${record.NAME ?? tract.name}.`,
            },
          } satisfies TractDemographics;
        } catch {
        }
      }
      return null;
    },
    (age) => {
      cacheAgeSeconds = age;
    },
  );

  if (!result) {
    return DEMO_MODE
      ? demoDemographics(tract)
      : unavailable(tract, "The Census ACS API did not return data for this tract.");
  }

  if (cacheAgeSeconds !== undefined && result.provenance.status === "live") {
    return {
      ...result,
      provenance: { ...result.provenance, status: "cached" },
    };
  }

  return result;
}
