"use client";

import {
  ChevronRight,
  Database,
  FileText,
  Info,
  MapPinned,
  ShieldCheck,
  Sparkles,
  Thermometer,
} from "lucide-react";
import ClimateTrendChart from "@/components/charts/ClimateTrendChart";
import DistributionChart from "@/components/charts/DistributionChart";
import HourlyProfileChart from "@/components/charts/HourlyProfileChart";
import ForecastStrip, { type ForecastHour } from "@/components/charts/ForecastStrip";
import HotspotDetail from "@/components/dashboard/HotspotDetail";
import { Badge, ProvenanceBadge } from "@/components/ui/Badge";
import {
  Card,
  Divider,
  EmptyState,
  SectionHeading,
  Skeleton,
  Stat,
} from "@/components/ui/Primitives";
import { SEVERITY_COLORS, SEVERITY_LABELS } from "@/lib/colors";
import {
  cn,
  formatArea,
  formatDelta,
  formatPercent,
  formatTemperatureDual,
} from "@/lib/format";
import type { AnalysisResult } from "@/lib/types";

interface SidePanelProps {
  analysis: AnalysisResult | null;
  loading: boolean;
  loadingStage: string | null;
  error: { message: string; hint?: string } | null;
  selectedHotspotId: string | null;
  onSelectHotspot: (id: string | null) => void;
  forecastHours: ForecastHour[];
  forecastOffset: number;
  onForecastSelect: (offset: number) => void;
  showForecastStrip: boolean;
  onGenerateReport: () => void;
}

export default function SidePanel({
  analysis,
  loading,
  loadingStage,
  error,
  selectedHotspotId,
  onSelectHotspot,
  forecastHours,
  forecastOffset,
  onForecastSelect,
  showForecastStrip,
  onGenerateReport,
}: SidePanelProps) {
  if (loading && !analysis) return <LoadingPanel stage={loadingStage} />;

  if (error && !analysis) {
    return (
      <div className="p-4">
        <EmptyState
          icon={<Info className="h-7 w-7" />}
          title={error.message}
          description={error.hint}
        />
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="p-4">
        <EmptyState
          icon={<MapPinned className="h-7 w-7" />}
          title="Choose an area to analyse"
          description="Search for a US address or city, or switch on Pick and click the map. HeatLens will map the temperature field, find statistically distinct hotspots, and explain what is driving them."
        />
      </div>
    );
  }

  const selectedHotspot = analysis.hotspots.find((h) => h.id === selectedHotspotId) ?? null;

  if (selectedHotspot) {
    return (
      <div className="p-4">
        <HotspotDetail
          hotspot={selectedHotspot}
          analysis={analysis}
          onBack={() => onSelectHotspot(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      {loading && (
        <div className="flex items-center gap-2 rounded-lg border border-accent-200 bg-accent-50 px-3 py-2 text-[11px] font-medium text-accent-800">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-600" />
          {loadingStage ?? "Refreshing analysis…"}
        </div>
      )}

      <SummaryCard analysis={analysis} onGenerateReport={onGenerateReport} />

      {showForecastStrip && (
        <Card className="p-4">
          <SectionHeading
            title="Next 12 hours"
            description="Area-mean temperature by forecast hour."
          />
          <div className="mt-3">
            <ForecastStrip
              hours={forecastHours}
              selectedOffset={forecastOffset}
              onSelect={onForecastSelect}
              disabled={loading}
            />
          </div>
        </Card>
      )}

      <InsightsCard analysis={analysis} />
      <HotspotListCard analysis={analysis} onSelectHotspot={onSelectHotspot} />

      {analysis.hourlyProfile.samples.length > 1 && (
        <Card className="p-4">
          <SectionHeading
            title="Thermal comfort through the day"
            description="Heat index and apparent temperature at the area centre."
            actions={<ProvenanceBadge provenance={analysis.hourlyProfile.provenance} />}
          />
          <div className="mt-3">
            <HourlyProfileChart
              profile={analysis.hourlyProfile}
              thresholdC={analysis.summary.thresholdC}
            />
          </div>
        </Card>
      )}

      <Card className="p-4">
        <SectionHeading
          title="Temperature spread across the area"
          description="A long tail on the right means heat is concentrated and targeted work will pay off."
          actions={<ProvenanceBadge provenance={analysis.grid.provenance} />}
        />
        <div className="mt-3">
          <DistributionChart grid={analysis.grid} thresholdC={analysis.summary.thresholdC} />
        </div>
      </Card>

      {analysis.climateTrend.points.length > 1 && (
        <Card className="p-4">
          <SectionHeading
            title="Warm-season trajectory"
            description={
              analysis.climateTrend.trendCPerYear !== 0
                ? `Regional mean daily maximum is moving ${
                    analysis.climateTrend.trendCPerYear > 0 ? "up" : "down"
                  } ${Math.abs(analysis.climateTrend.trendCPerYear).toFixed(2)} °C per year since 2021.`
                : "Regional context since 2021."
            }
            actions={<ProvenanceBadge provenance={analysis.climateTrend.provenance} />}
          />
          <div className="mt-3">
            <ClimateTrendChart trend={analysis.climateTrend} />
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-ink-400">
            Regional resolution (roughly 50 km). This sets the trajectory the area is on; the
            hotspot figures above are the block-level picture.
          </p>
        </Card>
      )}

      <DataQualityCard analysis={analysis} />
    </div>
  );
}

function SummaryCard({
  analysis,
  onGenerateReport,
}: {
  analysis: AnalysisResult;
  onGenerateReport: () => void;
}) {
  const { summary } = analysis;

  return (
    <Card className="overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-ink-900">{analysis.placeLabel}</h2>
            <p className="mt-0.5 text-[11px] text-ink-500">{analysis.resolvedDateTime.label}</p>
            {analysis.exposureWindow && (
              <p className="mt-1 text-[10px] text-ink-400">
                Exposure window {analysis.exposureWindow.localLabel} · hotspot cells ≥{" "}
                {analysis.detectionThresholdZ.toFixed(1)}σ above the area mean
              </p>
            )}
          </div>
          <ProvenanceBadge provenance={analysis.grid.provenance} />
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-3">
          <Stat label="Area mean" value={formatTemperatureDual(summary.meanTempC)} className="[&_dd]:text-base" />
          <Stat label="Hottest" value={formatTemperatureDual(summary.peakTempC)} tone="hot" className="[&_dd]:text-base" />
          <Stat label="Coolest" value={formatTemperatureDual(summary.minTempC)} tone="cool" className="[&_dd]:text-base" />
        </dl>

        <dl className="mt-4 grid grid-cols-3 gap-3">
          <Stat
            label="Heat gap"
            value={formatDelta(summary.heatGapC)}
            sublabel="hottest vs. coolest block"
            className="[&_dd]:text-base"
          />
          <Stat
            label={`Above ${summary.thresholdC}°C`}
            value={formatPercent(summary.shareAboveThreshold * 100)}
            sublabel="of the area"
            className="[&_dd]:text-base"
          />
          <Stat
            label="Hotspots"
            value={analysis.hotspots.length}
            sublabel={`${summary.areaSqMiles.toFixed(2)} mi² scanned`}
            className="[&_dd]:text-base"
          />
        </dl>
      </div>

      <Divider />

      <div className="flex items-center justify-between gap-2 bg-ink-50/70 px-4 py-2.5">
        <span className="text-[10px] text-ink-400 tnum">
          {summary.tileCount.toLocaleString()} tiles at {summary.granularityMeters} m ·{" "}
          {(analysis.computeMs / 1000).toFixed(1)}s
        </span>
        <button
          type="button"
          onClick={onGenerateReport}
          className="flex items-center gap-1.5 rounded-lg bg-ink-900 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-ink-800"
        >
          <FileText className="h-3.5 w-3.5" />
          Generate report
        </button>
      </div>
    </Card>
  );
}

function InsightsCard({ analysis }: { analysis: AnalysisResult }) {
  const { insights } = analysis;

  return (
    <Card className="p-4">
      <SectionHeading
        title="Executive summary"
        actions={
          <Badge tone={insights.generator === "llm" ? "violet" : "neutral"} title={insights.provenance.note}>
            <Sparkles className="h-3 w-3" />
            {insights.generator === "llm" ? "AI-phrased" : "Rule-based"}
          </Badge>
        }
      />
      <p className="mt-2.5 text-sm font-medium leading-relaxed text-ink-900">{insights.headline}</p>
      <p className="mt-2 text-xs leading-relaxed text-ink-600">{insights.narrative}</p>
      {insights.keyFindings.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {insights.keyFindings.map((finding) => (
            <li key={finding} className="flex gap-2 text-[11px] leading-relaxed text-ink-600">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-300" />
              {finding}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[10px] leading-relaxed text-ink-400">
        Every figure above is computed by the analysis engine. The language model, when enabled,
        only phrases them.
      </p>
    </Card>
  );
}

function HotspotListCard({
  analysis,
  onSelectHotspot,
}: {
  analysis: AnalysisResult;
  onSelectHotspot: (id: string) => void;
}) {
  if (analysis.hotspots.length === 0) {
    return (
      <Card className="p-4">
        <SectionHeading title="Hotspots" />
        <div className="mt-3">
          <EmptyState
            icon={<Thermometer className="h-6 w-6" />}
            title="No distinct hotspots in this area"
            description={
              analysis.dataQuality.caveats[0] ??
              "Temperature here is fairly uniform, so no contiguous zone stands out statistically. Try a larger area, or a hotter time of day."
            }
          />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="p-4 pb-2">
        <SectionHeading
          title={`${analysis.hotspots.length} hotspot${analysis.hotspots.length === 1 ? "" : "s"} detected`}
          description="Ranked by severity: thermal intensity, exposure duration, absolute heat and population vulnerability."
        />
      </div>
      <ul className="divide-y divide-ink-100">
        {analysis.hotspots.map((hotspot) => (
          <li key={hotspot.id}>
            <button
              type="button"
              onClick={() => onSelectHotspot(hotspot.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-ink-50"
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: SEVERITY_COLORS[hotspot.severityTier] }}
              >
                {hotspot.rank}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-xs font-medium text-ink-900">
                    {hotspot.addressLabel ?? `Hotspot ${hotspot.rank}`}
                  </span>
                  <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-ink-400">
                    {SEVERITY_LABELS[hotspot.severityTier]}
                  </span>
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-ink-500 tnum">
                  <span>{formatTemperatureDual(hotspot.meanTempC, 1)}</span>
                  <span className="text-red-700">{formatDelta(hotspot.anomalyC)}</span>
                  <span>{formatArea(hotspot.areaSqMeters)}</span>
                </span>
                {hotspot.factors[0] && (
                  <span className="mt-1 block truncate text-[10px] text-ink-400">
                    Main driver: {hotspot.factors[0].label.toLowerCase()} ({hotspot.factors[0].value}
                    {hotspot.factors[0].unit === "%" ? "%" : ` ${hotspot.factors[0].unit}`})
                  </span>
                )}
              </span>

              <span className="flex shrink-0 items-center gap-1.5">
                <span className="text-sm font-semibold text-ink-900 tnum">
                  {hotspot.severityScore}
                </span>
                <ChevronRight className="h-4 w-4 text-ink-300" />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function DataQualityCard({ analysis }: { analysis: AnalysisResult }) {
  const { dataQuality } = analysis;

  const tone =
    dataQuality.confidenceLabel === "high"
      ? "accent"
      : dataQuality.confidenceLabel === "moderate"
        ? "warn"
        : "danger";

  return (
    <Card className="p-4">
      <SectionHeading
        title="Data sources and confidence"
        actions={
          <Badge tone={tone}>
            <ShieldCheck className="h-3 w-3" />
            <span className="capitalize">{dataQuality.confidenceLabel} confidence</span>
          </Badge>
        }
      />

      <ul className="mt-3 space-y-2">
        {dataQuality.provenance.map((entry) => (
          <li key={`${entry.source}-${entry.status}`} className="flex items-start justify-between gap-2">
            <span className="min-w-0">
              <span className="block truncate text-[11px] font-medium text-ink-800">
                {entry.source}
              </span>
              {entry.note && (
                <span className="mt-0.5 block text-[10px] leading-snug text-ink-400">
                  {entry.note}
                </span>
              )}
            </span>
            <ProvenanceBadge provenance={entry} className="shrink-0" />
          </li>
        ))}
      </ul>

      {dataQuality.caveats.length > 0 && (
        <div className="mt-3 rounded-lg bg-ink-50 p-2.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-500">
            <Database className="h-3 w-3" />
            Caveats
          </p>
          <ul className="mt-1.5 space-y-1">
            {dataQuality.caveats.map((caveat) => (
              <li key={caveat} className="text-[10px] leading-relaxed text-ink-500">
                {caveat}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function LoadingPanel({ stage }: { stage: string | null }) {
  const stages = [
    "Submitting heatmap request to FortyGuard",
    "Waiting for the temperature grid",
    "Detecting hotspots",
    "Sampling land cover and demographics",
    "Building recommendations",
  ];

  const activeIndex = stage ? stages.findIndex((s) => stage.startsWith(s.slice(0, 18))) : 0;

  return (
    <div className="space-y-3 p-4">
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-600" />
          <p className="text-xs font-medium text-ink-800">{stage ?? "Running analysis…"}</p>
        </div>

        <ol className="mt-3 space-y-2">
          {stages.map((label, index) => {
            const done = activeIndex > index;
            const active = activeIndex === index;
            return (
              <li
                key={label}
                className={cn(
                  "flex items-center gap-2 text-[11px] transition-colors",
                  done ? "text-ink-400" : active ? "text-ink-900" : "text-ink-300",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    done ? "bg-accent-400" : active ? "animate-pulse bg-accent-600" : "bg-ink-200",
                  )}
                />
                {label}
              </li>
            );
          })}
        </ol>

        <p className="mt-3 text-[10px] leading-relaxed text-ink-400">
          FortyGuard builds heatmaps asynchronously. A fresh area at fine granularity can take up to
          a minute; repeat queries for the same area and time are served from cache.
        </p>
      </Card>

      <Card className="space-y-3 p-4">
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-3 w-1/2" />
      </Card>
      <Card className="space-y-3 p-4">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-24 w-full" />
      </Card>
    </div>
  );
}
