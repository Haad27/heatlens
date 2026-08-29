"use client";

import { useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  Clock3,
  Crosshair,
  Layers,
  RefreshCw,
  Settings2,
  Zap,
} from "lucide-react";
import type { MapLayerKey } from "@/components/map/MapView";
import { cn, formatIsoDate } from "@/lib/format";
import type { AnalysisMode } from "@/lib/types";

export interface ControlState {
  mode: AnalysisMode;
  date: string;
  time: string;
  radiusMeters: number;
  granularity: 60 | 80 | 100;
  thresholdC: number;
}

const MODES: { key: AnalysisMode; label: string; icon: React.ElementType; hint: string }[] = [
  { key: "current", label: "Now", icon: Clock3, hint: "Most recent settled hour" },
  { key: "historical", label: "Historical", icon: CalendarDays, hint: "Any date from 2021 onward" },
  { key: "forecast", label: "Forecast", icon: Zap, hint: "Up to 12 hours ahead" },
];

const RADII = [
  { value: 600, label: "0.6 km" },
  { value: 1200, label: "1.2 km" },
  { value: 1800, label: "1.8 km" },
  { value: 2400, label: "2.4 km" },
];

const THRESHOLDS = [
  { value: 30, label: "30 °C / 86 °F", hint: "NWS caution" },
  { value: 32.2, label: "32 °C / 90 °F", hint: "NWS extreme caution" },
  { value: 35, label: "35 °C / 95 °F", hint: "Sustained-exposure risk" },
  { value: 39.4, label: "39 °C / 103 °F", hint: "NWS danger" },
];

const LAYERS: { key: MapLayerKey; label: string; hint: string }[] = [
  { key: "temperature", label: "Temperature", hint: "Air temperature at the selected hour" },
  { key: "exceedance", label: "Hours above", hint: "Hours spent above the heat-risk threshold" },
  { key: "persistence", label: "Longest run", hint: "Longest unbroken run above the threshold" },
];

export default function AnalysisControls({
  state,
  onChange,
  onRun,
  activeLayer,
  onLayerChange,
  availableLayers,
  overlayOpacity,
  onOpacityChange,
  pickMode,
  onTogglePickMode,
  loading,
  className,
}: {
  state: ControlState;
  onChange: (next: Partial<ControlState>) => void;
  onRun: () => void;
  activeLayer: MapLayerKey;
  onLayerChange: (layer: MapLayerKey) => void;
  availableLayers: Record<MapLayerKey, boolean>;
  overlayOpacity: number;
  onOpacityChange: (value: number) => void;
  pickMode: boolean;
  onTogglePickMode: () => void;
  loading: boolean;
  className?: string;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const today = formatIsoDate(new Date());

  return (
    <div
      className={cn(
        "w-[min(92vw,26rem)] rounded-xl border border-ink-200 bg-white/97 shadow-lg backdrop-blur",
        className,
      )}
    >
      <div className="p-3">
        <div
          role="tablist"
          aria-label="Analysis time mode"
          className="flex rounded-lg bg-ink-100 p-0.5"
        >
          {MODES.map((mode) => {
            const Icon = mode.icon;
            const active = state.mode === mode.key;
            return (
              <button
                key={mode.key}
                role="tab"
                aria-selected={active}
                title={mode.hint}
                onClick={() => onChange({ mode: mode.key })}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-[7px] px-2 py-1.5 text-xs font-medium transition",
                  active
                    ? "bg-white text-ink-900 shadow-sm"
                    : "text-ink-500 hover:text-ink-800",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {mode.label}
              </button>
            );
          })}
        </div>

        {state.mode === "historical" && (
          <div className="mt-2.5 flex gap-2">
            <label className="flex-1">
              <span className="sr-only">Date</span>
              <input
                type="date"
                value={state.date}
                min="2021-01-01"
                max={today}
                onChange={(event) => onChange({ date: event.target.value })}
                className="w-full rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />
            </label>
            <label className="w-28">
              <span className="sr-only">Local time</span>
              <input
                type="time"
                step={3600}
                value={state.time}
                onChange={(event) => onChange({ time: event.target.value })}
                className="w-full rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />
            </label>
          </div>
        )}

        <div className="mt-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={onRun}
            disabled={loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-ink-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            {loading ? "Analysing…" : "Run analysis"}
          </button>
          <button
            type="button"
            onClick={onTogglePickMode}
            aria-pressed={pickMode}
            title="Click the map to move the area of interest"
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition",
              pickMode
                ? "border-accent-400 bg-accent-50 text-accent-800"
                : "border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:text-ink-900",
            )}
          >
            <Crosshair className="h-3.5 w-3.5" />
            Pick
          </button>
        </div>
      </div>

      <div className="border-t border-ink-100 px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 shrink-0 text-ink-400" />
          <div className="flex flex-1 gap-1">
            {LAYERS.map((layer) => {
              const enabled = availableLayers[layer.key];
              const active = activeLayer === layer.key;
              return (
                <button
                  key={layer.key}
                  type="button"
                  disabled={!enabled}
                  title={enabled ? layer.hint : `${layer.hint} — not available for this analysis`}
                  onClick={() => onLayerChange(layer.key)}
                  className={cn(
                    "flex-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition",
                    active
                      ? "bg-ink-900 text-white"
                      : enabled
                        ? "bg-ink-100 text-ink-600 hover:bg-ink-200"
                        : "cursor-not-allowed bg-ink-50 text-ink-300",
                  )}
                >
                  {layer.label}
                </button>
              );
            })}
          </div>
        </div>

        <label className="mt-2.5 flex items-center gap-2">
          <span className="w-14 shrink-0 text-[11px] font-medium text-ink-400">Opacity</span>
          <input
            type="range"
            min={20}
            max={100}
            value={Math.round(overlayOpacity * 100)}
            onChange={(event) => onOpacityChange(Number(event.target.value) / 100)}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-ink-200 accent-accent-600"
          />
          <span className="w-8 shrink-0 text-right text-[11px] text-ink-500 tnum">
            {Math.round(overlayOpacity * 100)}%
          </span>
        </label>
      </div>

      <div className="border-t border-ink-100">
        <button
          type="button"
          onClick={() => setAdvancedOpen((open) => !open)}
          aria-expanded={advancedOpen}
          className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-medium text-ink-500 transition hover:text-ink-800"
        >
          <span className="flex items-center gap-1.5">
            <Settings2 className="h-3.5 w-3.5" />
            Area, resolution and threshold
          </span>
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", advancedOpen && "rotate-180")}
          />
        </button>

        {advancedOpen && (
          <div className="space-y-3 px-3 pb-3">
            <Field label="Area radius" hint="FortyGuard caps a heatmap at 10 mi² on the Basic plan">
              <SegmentedControl
                options={RADII.map((r) => ({ value: r.value, label: r.label }))}
                value={state.radiusMeters}
                onChange={(value) => onChange({ radiusMeters: value })}
              />
            </Field>

            <Field label="Grid resolution" hint="Finer grids take longer to generate">
              <SegmentedControl
                options={[
                  { value: 100, label: "100 m" },
                  { value: 80, label: "80 m" },
                  { value: 60, label: "60 m" },
                ]}
                value={state.granularity}
                onChange={(value) => onChange({ granularity: value as 60 | 80 | 100 })}
              />
            </Field>

            <Field
              label="Heat-risk threshold"
              hint="Used for the hours-above and longest-run layers, and for severity scoring"
            >
              <select
                value={state.thresholdC}
                onChange={(event) => onChange({ thresholdC: Number(event.target.value) })}
                className="w-full rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              >
                {THRESHOLDS.map((threshold) => (
                  <option key={threshold.value} value={threshold.value}>
                    {threshold.label} — {threshold.hint}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium text-ink-600">{label}</p>
      {children}
      {hint && <p className="mt-1 text-[10px] leading-snug text-ink-400">{hint}</p>}
    </div>
  );
}

function SegmentedControl<T extends number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="mt-1 flex rounded-lg bg-ink-100 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={option.value === value}
          className={cn(
            "flex-1 rounded-[7px] px-1.5 py-1 text-[11px] font-medium transition",
            option.value === value
              ? "bg-white text-ink-900 shadow-sm"
              : "text-ink-500 hover:text-ink-800",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
