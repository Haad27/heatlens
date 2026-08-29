import type { LatLng } from "@/lib/types";

/**
 * Local-time handling for US areas of interest.
 *
 * FortyGuard's date_time fields are UTC, but a planner thinks in local time —
 * "2 pm on the hottest day last July" is a local statement, and analysing it an
 * hour off would move it off the afternoon peak.
 *
 * The IANA zone is inferred from longitude, with explicit carve-outs for the two
 * US regions that do not observe daylight saving. Offsets themselves come from
 * `Intl.DateTimeFormat`, so DST transitions are handled correctly rather than
 * approximated. This is a geographic approximation at zone boundaries; it is
 * accurate for essentially all urban areas, which is where this product is used.
 */

const ZONES: { maxLng: number; zone: string }[] = [
  { maxLng: -67.5, zone: "America/Puerto_Rico" },
  { maxLng: -82.5, zone: "America/New_York" },
  { maxLng: -97.5, zone: "America/Chicago" },
  { maxLng: -112.5, zone: "America/Denver" },
  { maxLng: -127.5, zone: "America/Los_Angeles" },
  { maxLng: -142.5, zone: "America/Anchorage" },
  { maxLng: 180, zone: "Pacific/Honolulu" },
];

/** Arizona observes MST year-round, apart from the Navajo Nation. */
function isArizona(point: LatLng): boolean {
  return point.lat >= 31.3 && point.lat <= 37.0 && point.lng >= -114.9 && point.lng <= -109.0;
}

function isHawaii(point: LatLng): boolean {
  return point.lat >= 18.8 && point.lat <= 22.4 && point.lng >= -160.3 && point.lng <= -154.6;
}

export function timeZoneFor(point: LatLng): string {
  if (isHawaii(point)) return "Pacific/Honolulu";
  if (isArizona(point)) return "America/Phoenix";
  for (const entry of ZONES) {
    if (point.lng <= entry.maxLng) return entry.zone;
  }
  return "America/New_York";
}

/** UTC offset in minutes for `instant` in `timeZone` (positive means east of UTC). */
export function utcOffsetMinutes(timeZone: string, instant: Date): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = formatter.formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");

  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") === 24 ? 0 : get("hour"),
    get("minute"),
    get("second"),
  );

  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** Convert a local wall-clock date/time in `timeZone` to the matching UTC instant. */
export function localToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);

  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const firstGuess = new Date(naive);
  const offset1 = utcOffsetMinutes(timeZone, firstGuess);
  const corrected = new Date(naive - offset1 * 60_000);
  const offset2 = utcOffsetMinutes(timeZone, corrected);
  if (offset2 === offset1) return corrected;
  return new Date(naive - offset2 * 60_000);
}

interface UtcParts {
  date: string;
  time: string;
  hour: number;
}

export function utcParts(instant: Date): UtcParts {
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${instant.getUTCFullYear()}-${pad(instant.getUTCMonth() + 1)}-${pad(instant.getUTCDate())}`,
    time: `${pad(instant.getUTCHours())}:00`,
    hour: instant.getUTCHours(),
  };
}

export function localParts(instant: Date, timeZone: string): UtcParts {
  const offset = utcOffsetMinutes(timeZone, instant);
  const shifted = new Date(instant.getTime() + offset * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    time: `${pad(shifted.getUTCHours())}:00`,
    hour: shifted.getUTCHours(),
  };
}

export function formatLocalLabel(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(instant);
}

export function formatLocalDateLabel(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(instant);
}

/** Today's date in the AOI's local zone, as YYYY-MM-DD. */
export function localToday(timeZone: string): string {
  return localParts(new Date(), timeZone).date;
}

export function defaultHistoricalDate(): string {
  return "2024-07-15";
}

/** Round an instant down to the top of the hour. */
export function floorToHour(instant: Date): Date {
  const copy = new Date(instant);
  copy.setUTCMinutes(0, 0, 0);
  return copy;
}
