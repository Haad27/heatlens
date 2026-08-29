"use client";

import { buildTemperatureScale } from "@/lib/colors";
import { celsiusToFahrenheit, cn, formatClockHour } from "@/lib/format";

export interface ForecastHour {
  offsetHours: number;
  hourLocal: number;
  meanTempC: number;
  peakTempC: number;
  loading?: boolean;
}

/**
 * The 12-hour forecast scrubber.
 *
 * Each hour is a separate FortyGuard submission, so hours are loaded on demand
 * as the user selects them rather than pre-fetched. Hours that have not been
 * requested yet show as empty rather than as a guessed value — a placeholder
 * temperature would be indistinguishable from a real one.
 */
export default function ForecastStrip({
  hours,
  selectedOffset,
  onSelect,
  disabled,
}: {
  hours: ForecastHour[];
  selectedOffset: number;
  onSelect: (offsetHours: number) => void;
  disabled?: boolean;
}) {
  const loaded = hours.filter((h) => !h.loading && Number.isFinite(h.meanTempC));
  const scale = loaded.length
    ? buildTemperatureScale(
        Math.min(...loaded.map((h) => h.meanTempC)),
        Math.max(...loaded.map((h) => h.meanTempC)),
      )
    : null;

  return (
    <div>
      <div className="flex items-end gap-[3px]">
        {hours.map((hour) => {
          const isSelected = hour.offsetHours === selectedOffset;
          const hasValue = !hour.loading && Number.isFinite(hour.meanTempC);
          return (
            <button
              key={hour.offsetHours}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(hour.offsetHours)}
              aria-pressed={isSelected}
              aria-label={`Forecast for ${formatClockHour(hour.hourLocal)} local${
                hasValue ? `, mean ${hour.meanTempC.toFixed(1)} degrees Celsius` : ", not yet loaded"
              }`}
              title={
                hasValue
                  ? `${formatClockHour(hour.hourLocal)} · ${hour.meanTempC.toFixed(
                      1,
                    )} °C / ${celsiusToFahrenheit(hour.meanTempC).toFixed(0)} °F area mean`
                  : `${formatClockHour(hour.hourLocal)} · select to load`
              }
              className={cn(
                "group relative flex-1 rounded-md pt-6 transition-all",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <span
                className={cn(
                  "block h-8 w-full rounded-[3px] ring-1 ring-inset transition-all",
                  isSelected ? "ring-ink-900/60" : "ring-ink-900/10 group-hover:ring-ink-900/30",
                  hour.loading && "shimmer",
                )}
                style={{
                  backgroundColor:
                    hasValue && scale ? scale.colorFor(hour.meanTempC) : undefined,
                  backgroundImage:
                    !hasValue && !hour.loading
                      ? "repeating-linear-gradient(45deg, #eceef2 0 4px, #f6f7f9 4px 8px)"
                      : undefined,
                  transform: isSelected ? "scaleY(1.28)" : undefined,
                }}
              />
              <span
                className={cn(
                  "mt-1.5 block text-[10px] font-medium tnum",
                  isSelected ? "text-ink-900" : "text-ink-400",
                )}
              >
                {formatClockHour(hour.hourLocal)}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] leading-snug text-ink-400">
        Hatched hours have not been requested yet. Selecting one submits a forecast heatmap for
        that hour, so only the hours you look at consume API credits.
      </p>
    </div>
  );
}
