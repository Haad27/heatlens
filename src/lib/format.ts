import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function celsiusToFahrenheit(celsius: number): number {
  return celsius * 1.8 + 32;
}

/**
 * Temperatures are shown in both scales throughout.
 *
 * The target user is American and thinks in Fahrenheit; the FortyGuard API,
 * NLCD and every piece of published cooling research are in Celsius. Showing one
 * and hiding the other forces a mental conversion at exactly the moment someone
 * is comparing a measurement against a threshold.
 */
export function formatTemperature(celsius: number, options?: { precision?: number }): string {
  const precision = options?.precision ?? 1;
  return `${celsius.toFixed(precision)} °C`;
}

export function formatTemperatureDual(celsius: number, precision = 1): string {
  return `${celsius.toFixed(precision)} °C / ${celsiusToFahrenheit(celsius).toFixed(0)} °F`;
}

export function formatDelta(celsius: number, precision = 1): string {
  const sign = celsius > 0 ? "+" : "";
  return `${sign}${celsius.toFixed(precision)} °C`;
}

export function formatPercent(value: number, precision = 0): string {
  return `${value.toFixed(precision)}%`;
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatArea(sqMeters: number): string {
  const hectares = sqMeters / 10_000;
  if (hectares < 1) return `${Math.round(sqMeters).toLocaleString()} m²`;
  const acres = sqMeters / 4046.86;
  return `${hectares.toFixed(1)} ha / ${acres.toFixed(1)} ac`;
}

export function formatRelativeTime(isoTimestamp: string): string {
  const then = new Date(isoTimestamp).getTime();
  if (Number.isNaN(then)) return "unknown";

  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 0) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86_400)} d ago`;
}

export function formatClockHour(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24;
  if (normalized === 0) return "12a";
  if (normalized === 12) return "12p";
  return normalized < 12 ? `${normalized}a` : `${normalized - 12}p`;
}

/** Full wall-clock label, e.g. "2:00 PM". */
export function formatClockHourLong(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24;
  const suffix = normalized >= 12 ? "PM" : "AM";
  const display = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${display}:00 ${suffix}`;
}

export function formatIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
