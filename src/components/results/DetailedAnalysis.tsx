"use client";

import { useState } from "react";
import { Building2, Flame, TreePine } from "lucide-react";
import { cn } from "@/lib/format";
import type { AnalysisBrief, BriefHotZone, CoolZone } from "@/lib/types";

type TabKey = "hotspots" | "vegetation" | "correlations";

const TABS: { key: TabKey; label: string; icon: typeof Flame }[] = [
  { key: "hotspots", label: "Hotspot Analysis", icon: Flame },
  { key: "vegetation", label: "Vegetation Insights", icon: TreePine },
  { key: "correlations", label: "Urban Correlations", icon: Building2 },
];

const SEVERITY_BADGE: Record<BriefHotZone["severity"], string> = {
  extreme: "bg-red-700 text-white",
  high: "bg-red-500 text-white",
  medium: "bg-orange-400 text-white",
};

const INTENSITY_BADGE: Record<CoolZone["intensity"], string> = {
  high: "bg-sky-800 text-white",
  medium: "bg-emerald-600 text-white",
  low: "bg-emerald-400 text-white",
};

export default function DetailedAnalysis({
  brief,
  onSelectHotspot,
  selectedHotspotId,
}: {
  brief: AnalysisBrief;
  onSelectHotspot: (id: string | null) => void;
  selectedHotspotId: string | null;
}) {
  const [tab, setTab] = useState<TabKey>("hotspots");

  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-xl font-semibold tracking-tight text-ink-900">Detailed Analysis</h2>

      <div className="mt-4 flex flex-wrap gap-2">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium shadow-sm transition",
                active
                  ? item.key === "vegetation"
                    ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                    : "bg-white text-ink-900 ring-1 ring-ink-200"
                  : "bg-ink-50 text-ink-500 hover:text-ink-800",
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4",
                  item.key === "hotspots" && "text-red-500",
                  item.key === "vegetation" && "text-emerald-600",
                  item.key === "correlations" && "text-ink-400",
                )}
              />
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        {tab === "hotspots" && (
          <HotspotTab
            brief={brief}
            onSelectHotspot={onSelectHotspot}
            selectedHotspotId={selectedHotspotId}
          />
        )}
        {tab === "vegetation" && <VegetationTab brief={brief} />}
        {tab === "correlations" && <CorrelationsTab brief={brief} />}
      </div>
    </section>
  );
}

function HotspotTab({
  brief,
  onSelectHotspot,
  selectedHotspotId,
}: {
  brief: AnalysisBrief;
  onSelectHotspot: (id: string | null) => void;
  selectedHotspotId: string | null;
}) {
  const { thermalOverview, hotZones, coolZones } = brief;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-sky-50 p-5">
        <p className="text-sm font-semibold text-ink-900">Thermal Overview</p>
        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-3xl font-semibold text-red-600 tnum">{thermalOverview.hotSpotCount}</p>
            <p className="mt-1 text-xs text-ink-500">Hot Spots</p>
          </div>
          <div>
            <p className="text-3xl font-semibold text-sky-600 tnum">{thermalOverview.coolSpotCount}</p>
            <p className="mt-1 text-xs text-ink-500">Cool Spots</p>
          </div>
          <div>
            <p className="text-3xl font-semibold text-ink-900">{thermalOverview.heatIslandSeverity}</p>
            <p className="mt-1 text-xs text-ink-500">Heat Island Severity</p>
          </div>
        </div>
        <p className="mt-4 text-sm text-ink-600">{thermalOverview.summary}</p>
      </div>

      <div>
        <h3 className="text-base font-semibold text-ink-900">Hot Zones</h3>
        <ul className="mt-3 space-y-2.5">
          {hotZones.length === 0 && (
            <li className="rounded-xl border border-ink-100 bg-ink-50 px-4 py-3 text-sm text-ink-500">
              No distinct hotspots in this area.
            </li>
          )}
          {hotZones.map((zone) => {
            const active = zone.hotspotId === selectedHotspotId;
            return (
              <li key={zone.id}>
                <button
                  type="button"
                  onClick={() => onSelectHotspot(active ? null : zone.hotspotId)}
                  className={cn(
                    "flex w-full items-start justify-between gap-3 rounded-xl border px-4 py-3 text-left transition",
                    active
                      ? "border-red-200 bg-red-50"
                      : "border-red-100 bg-red-50/70 hover:border-red-200",
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-red-900">{zone.name}</p>
                    <p className="mt-1 text-sm text-ink-600">{zone.description}</p>
                    <p className="mt-2 text-sm font-semibold text-red-700">Cause: {zone.cause}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize",
                      SEVERITY_BADGE[zone.severity],
                    )}
                  >
                    {zone.severity}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {coolZones.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-ink-900">Cool Zones</h3>
          <ul className="mt-3 space-y-2.5">
            {coolZones.map((zone) => (
              <li
                key={zone.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-sky-100 bg-sky-50/80 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-sky-900">{zone.name}</p>
                  <p className="mt-1 text-sm text-ink-600">{zone.description}</p>
                  <p className="mt-2 text-sm font-semibold text-sky-700">Source: {zone.source}</p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize",
                    INTENSITY_BADGE[zone.intensity],
                  )}
                >
                  {zone.intensity}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function VegetationTab({ brief }: { brief: AnalysisBrief }) {
  const { vegetation } = brief;

  return (
    <div className="space-y-6 rounded-2xl bg-emerald-50/60 p-1 sm:p-2">
      <p className="text-sm text-ink-700">{vegetation.summary}</p>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-ink-900">Tree Coverage</h3>
          <ul className="mt-2 space-y-1.5">
            {vegetation.treeCoverage.length === 0 && (
              <li className="text-sm text-ink-500">No distinct tree patches found.</li>
            )}
            {vegetation.treeCoverage.map((patch) => (
              <li key={patch.name} className="text-sm text-ink-700">
                <span className="font-semibold italic">{patch.name}</span>
                {": "}
                {patch.density} density, {patch.area} area
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink-900">Parks & Green Spaces</h3>
          <ul className="mt-2 space-y-1.5">
            {vegetation.parks.length === 0 && (
              <li className="text-sm text-ink-500">No park-scale cool zones found.</li>
            )}
            {vegetation.parks.map((park) => (
              <li key={park.name} className="text-sm text-ink-700">
                <span className="font-semibold italic">{park.name}</span>
                {": "}
                {park.size} size, {park.quality} quality
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        <h3 className="text-base font-semibold text-ink-900">Vegetation Gaps</h3>
        <ul className="mt-3 space-y-2">
          {vegetation.gaps.map((gap) => (
            <li
              key={gap.name}
              className="rounded-xl border border-ink-100 bg-white px-4 py-3 shadow-sm"
            >
              <p className="text-sm font-semibold text-ink-900">{gap.name}</p>
              <p className="mt-0.5 text-sm text-ink-500">Development: {gap.development}</p>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-base font-semibold text-ink-900">Green Opportunities</h3>
        <ul className="mt-3 space-y-2">
          {vegetation.opportunities.length === 0 && (
            <li className="rounded-xl border border-emerald-100 bg-white px-4 py-3 text-sm text-ink-500">
              No planting opportunity scored above the rule thresholds.
            </li>
          )}
          {vegetation.opportunities.map((item) => (
            <li
              key={`${item.name}-${item.action}`}
              className="flex items-start justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3"
            >
              <div>
                <p className="text-sm font-semibold text-ink-900">{item.name}</p>
                <p className="mt-1 text-sm text-emerald-700">Feasibility: {item.feasibility}</p>
              </div>
              <p className="text-sm font-semibold text-ink-800">Impact: {item.impact}</p>
              <span className="shrink-0 rounded-full bg-emerald-800 px-2.5 py-0.5 text-xs font-semibold text-white">
                {item.action}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function CorrelationsTab({ brief }: { brief: AnalysisBrief }) {
  const { correlations } = brief;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-ink-900">Urban Heat Sources</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {correlations.heatSources.map((source) => (
            <span
              key={source}
              className="rounded-xl border border-ink-100 bg-white px-3 py-1.5 text-sm text-ink-700 shadow-sm"
            >
              {source}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-sky-50 px-4 py-3">
        <p className="text-sm font-semibold text-sky-800">Building Analysis</p>
        <p className="mt-2 text-sm text-ink-700">
          Density: <span className="font-semibold text-sky-800">{correlations.buildingDensity}</span>
        </p>
        <p className="mt-1 text-sm text-ink-700">
          Materials:{" "}
          <span className="font-semibold text-sky-800">{correlations.materials.join(", ")}</span>
        </p>
      </div>

      <div>
        <h3 className="text-base font-semibold text-ink-900">Heat Correlations</h3>
        <ul className="mt-3 space-y-2">
          {correlations.correlations.map((line) => (
            <li
              key={line}
              className="rounded-xl border border-ink-100 bg-white px-4 py-3 text-sm text-ink-700 shadow-sm"
            >
              {line}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl bg-red-50 px-4 py-3">
        <p className="text-sm font-semibold text-red-700">Infrastructure Impact</p>
        <p className="mt-1.5 text-sm text-ink-700">{correlations.infrastructureImpact}</p>
      </div>
    </div>
  );
}
