"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Building2, CheckCircle2, FlaskConical, Loader2, Thermometer, TreePine } from "lucide-react";
import DetailedAnalysis from "@/components/results/DetailedAnalysis";
import RecommendationsPanel from "@/components/results/RecommendationsPanel";
import { Skeleton } from "@/components/ui/Primitives";
import type { MapLayerKey } from "@/components/map/MapView";
import type { AnalysisResult, HeatGrid, LatLng } from "@/lib/types";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-ink-100">
      <Skeleton className="h-full w-full" />
    </div>
  ),
});

export default function ResultsView({
  analysis,
  center,
  grid,
  selectedHotspotId,
  onSelectHotspot,
  overlayOpacity,
  onNewAnalysis,
  onDownload,
  selectedRecommendationId,
  onSelectRecommendation,
  demoMode,
}: {
  analysis: AnalysisResult;
  center: LatLng;
  grid?: HeatGrid;
  selectedHotspotId: string | null;
  onSelectHotspot: (id: string | null) => void;
  overlayOpacity: number;
  onNewAnalysis: () => void;
  onDownload: () => void;
  selectedRecommendationId: string | null;
  onSelectRecommendation: (id: string) => void;
  demoMode: boolean;
}) {
  const { brief, summary } = analysis;
  const veg = brief.areaMetrics.vegetationCoveragePct || summary.vegetationCoveragePct || 0;
  const built = brief.areaMetrics.buildingDensityPct || summary.buildingDensityPct || 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
            Analysis Results
          </h1>
          <p className="mt-1 text-sm text-ink-500">{analysis.placeLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          {demoMode && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
              <FlaskConical className="h-3 w-3" />
              Demo data
            </span>
          )}
          <button
            type="button"
            onClick={onNewAnalysis}
            className="rounded-lg bg-sky-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
          >
            New Analysis
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard
          icon={<TreePine className="h-4 w-4 text-emerald-600" />}
          title="Vegetation Coverage"
          subtitle="Current green space"
          value={`${veg}%`}
          barClass="bg-emerald-500"
          pct={veg}
        />
        <MetricCard
          icon={<Building2 className="h-4 w-4 text-sky-600" />}
          title="Building Density"
          subtitle="Urban development"
          value={`${built}%`}
          barClass="bg-sky-500"
          pct={built}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
        <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 px-4 py-3">
            <Thermometer className="h-4 w-4 text-red-500" />
            <h2 className="text-sm font-semibold text-ink-900">Heat Map Analysis</h2>
          </div>
          <div className="relative h-[22rem] border-t border-ink-100 sm:h-[28rem]">
            <MapView
              center={center}
              bbox={analysis.bbox}
              grid={grid}
              hotspots={analysis.hotspots}
              coolZones={brief.coolZones}
              selectedHotspotId={selectedHotspotId}
              activeLayer={"temperature" as MapLayerKey}
              overlayOpacity={overlayOpacity}
              onSelectHotspot={onSelectHotspot}
              onPickLocation={() => undefined}
              pickMode={false}
              compactLegend
            />
          </div>
        </section>

        <RecommendationsPanel
          recommendations={brief.recommendations}
          selectedId={selectedRecommendationId}
          onSelect={onSelectRecommendation}
          onDownload={onDownload}
        />
      </div>

      <DetailedAnalysis
        brief={brief}
        onSelectHotspot={onSelectHotspot}
        selectedHotspotId={selectedHotspotId}
      />
    </div>
  );
}

function MetricCard({
  icon,
  title,
  subtitle,
  value,
  barClass,
  pct,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  value: string;
  barClass: string;
  pct: number;
}) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        {icon}
        <div>
          <p className="text-sm font-semibold text-ink-900">{title}</p>
          <p className="text-xs text-ink-400">{subtitle}</p>
        </div>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-ink-900 tnum">{value}</p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-100">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

export function AnalysisLoading({
  stage,
  label,
  coords,
}: {
  stage: string | null;
  label: string | null;
  coords: LatLng | null;
}) {
  const [progress, setProgress] = useState(4);
  const startTimeRef = useRef(0);

  useEffect(() => {
    startTimeRef.current = Date.now();
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;

      let target: number;
      if (elapsed <= 12) {
        target = 4 + elapsed * 1.5;
      } else if (elapsed <= 36) {
        target = 22 + (elapsed - 12) * 1.16;
      } else if (elapsed <= 50) {
        target = 50 + (elapsed - 36) * 1.78;
      } else if (elapsed <= 65) {
        target = 75 + (elapsed - 50) * 1.06;
      } else {
        const extra = elapsed - 65;
        target = 91 + 6 * (1 - Math.exp(-extra / 25));
      }

      setProgress(Math.min(97, Math.max(4, target)));
    }, 250);

    return () => clearInterval(interval);
  }, []);

  const steps = [
    {
      name: "Satellite heat data",
      threshold: 50,
      activeSubtext:
        stage && (stage.includes("satellite") || stage.includes("FortyGuard") || stage.includes("hotspots") || stage.includes("thermal") || stage.includes("heat"))
          ? stage
          : "Fetching thermal telemetry & surface raster",
    },
    {
      name: "Land-cover sampling",
      threshold: 75,
      activeSubtext:
        stage && (stage.includes("Sampling") || stage.includes("census") || stage.includes("vulnerability") || stage.includes("canopy"))
          ? stage
          : "Analyzing tree canopy, pavement & demographic vulnerability",
    },
    {
      name: "Insight synthesis",
      threshold: 100,
      activeSubtext:
        stage && (stage.includes("Gemini") || stage.includes("Synthesizing") || stage.includes("insights") || stage.includes("Scoring"))
          ? stage
          : "Synthesizing executive narrative & interventions with Google Gemini",
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 items-center px-4 py-10">
      <div className="w-full rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink-900">Location Analysis</h2>
            {coords && (
              <p className="mt-1 text-sm text-ink-500 tnum">
                {label ?? "Selected location"} · {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
              </p>
            )}
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
            Analyzing {Math.round(progress)}%
          </span>
        </div>

        {/* Progress Bar with Percentage */}
        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-ink-500">
            <span>Overall Progress</span>
            <span className="font-semibold text-emerald-700 tnum">{Math.round(progress)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
            <div
              className="h-full rounded-full bg-emerald-600 transition-all duration-300 ease-out"
              style={{ width: `${Math.min(100, Math.max(progress, 4))}%` }}
            />
          </div>
        </div>

        <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-ink-400">
          Analysis pipeline
        </p>
        <ol className="mt-3 space-y-3">
          {steps.map((step, index) => {
            const prevThreshold = index === 0 ? 0 : steps[index - 1].threshold;
            const isCompleted = progress >= step.threshold;
            const isCurrent = !isCompleted && progress >= prevThreshold;

            return (
              <li
                key={step.name}
                className={`flex items-start gap-2.5 text-sm transition-colors ${
                  isCurrent
                    ? "font-medium text-ink-900"
                    : isCompleted
                      ? "text-ink-800"
                      : "text-ink-400"
                }`}
              >
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                  {isCompleted ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : isCurrent ? (
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-ink-200" />
                  )}
                </span>
                <div className="flex flex-wrap items-center gap-x-2">
                  <span>{step.name}</span>
                  {isCurrent && (
                    <span className="text-xs font-normal text-ink-500">
                      — {step.activeSubtext}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
