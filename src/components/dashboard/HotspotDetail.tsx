"use client";

import {
  ArrowLeft,
  Banknote,
  CircleDollarSign,
  Clock,
  Info,
  Leaf,
  Ruler,
  TrendingUp,
  Users,
} from "lucide-react";
import HourlyProfileChart from "@/components/charts/HourlyProfileChart";
import { Badge, ProvenanceBadge } from "@/components/ui/Badge";
import { Card, Divider, ProgressBar, SectionHeading, Stat } from "@/components/ui/Primitives";
import { COST_TIER_LABELS, IMPACT_TIER_LABELS } from "@/lib/analysis/recommendations";
import { CONTRIBUTION_COLORS, SEVERITY_COLORS, SEVERITY_LABELS, VULNERABILITY_COLORS } from "@/lib/colors";
import {
  cn,
  formatArea,
  formatCompactNumber,
  formatDelta,
  formatNumber,
  formatPercent,
  formatTemperatureDual,
} from "@/lib/format";
import type { AnalysisResult, Hotspot, Recommendation } from "@/lib/types";

export default function HotspotDetail({
  hotspot,
  analysis,
  onBack,
}: {
  hotspot: Hotspot;
  analysis: AnalysisResult;
  onBack: () => void;
}) {
  const severityColor = SEVERITY_COLORS[hotspot.severityTier];

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs font-medium text-ink-500 transition hover:text-ink-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All hotspots
      </button>

      <Card className="overflow-hidden">
        <div className="flex items-start gap-3 p-4">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
            style={{ backgroundColor: severityColor }}
          >
            {hotspot.rank}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-ink-900">
              {hotspot.addressLabel ?? `Hotspot ${hotspot.rank}`}
            </h2>
            <p className="mt-0.5 text-[11px] text-ink-400 tnum">
              {hotspot.center.lat.toFixed(5)}, {hotspot.center.lng.toFixed(5)}
            </p>
          </div>
          <span
            className="shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold text-white"
            style={{ backgroundColor: severityColor }}
          >
            {SEVERITY_LABELS[hotspot.severityTier]} · {hotspot.severityScore}
          </span>
        </div>

        <Divider />

        <dl className="grid grid-cols-3 gap-3 p-4">
          <Stat
            label="Mean"
            value={formatTemperatureDual(hotspot.meanTempC)}
            tone="hot"
            className="[&_dd]:text-base"
          />
          <Stat
            label="Peak"
            value={formatTemperatureDual(hotspot.peakTempC)}
            tone="hot"
            className="[&_dd]:text-base"
          />
          <Stat
            label="vs. area"
            value={formatDelta(hotspot.anomalyC)}
            sublabel={`${hotspot.zScore.toFixed(1)}σ above baseline`}
            className="[&_dd]:text-base"
          />
        </dl>

        <Divider />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 text-[11px] text-ink-500">
          <span className="flex items-center gap-1.5">
            <Ruler className="h-3 w-3" />
            {formatArea(hotspot.areaSqMeters)} · {hotspot.tileCount} tiles
          </span>
          {hotspot.exceedanceHours !== undefined && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              {hotspot.exceedanceHours} h above {analysis.summary.thresholdC} °C
              {analysis.exposureWindow ? ` (${analysis.exposureWindow.localLabel})` : ""}
            </span>
          )}
          {hotspot.persistenceHours !== undefined && (
            <span className="flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3" />
              {hotspot.persistenceHours} h longest run
            </span>
          )}
        </div>
      </Card>

      <SeverityBreakdown hotspot={hotspot} />
      <ContributingFactors hotspot={hotspot} />
      <VulnerabilityPanel hotspot={hotspot} />

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
              height={170}
            />
          </div>
          <div className="mt-2 flex items-center gap-4 text-[10px] text-ink-500">
            <LegendSwatch color="#d73027" label="Heat index" />
            <LegendSwatch color="#0d857e" label="Apparent temperature" dashed />
          </div>
        </Card>
      )}

      <Recommendations recommendations={hotspot.recommendations} />
    </div>
  );
}

function LegendSwatch({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="block h-0.5 w-4 rounded-full"
        style={{
          backgroundColor: dashed ? "transparent" : color,
          backgroundImage: dashed
            ? `repeating-linear-gradient(to right, ${color} 0 4px, transparent 4px 7px)`
            : undefined,
        }}
      />
      {label}
    </span>
  );
}

function SeverityBreakdown({ hotspot }: { hotspot: Hotspot }) {
  return (
    <Card className="p-4">
      <SectionHeading
        title="How this severity score was formed"
        description="Each term is normalised to 0–1, then weighted. Terms without data are dropped and the remaining weights renormalised."
      />
      <ul className="mt-3 space-y-2.5">
        {hotspot.severityBreakdown.map((term) => (
          <li key={term.label}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-ink-700">{term.label}</span>
              <span className="shrink-0 text-[11px] text-ink-400 tnum">
                {Math.round(term.normalized * 100)}/100 × {Math.round(term.weight * 100)}%
              </span>
            </div>
            <ProgressBar
              value={term.normalized}
              color={SEVERITY_COLORS[hotspot.severityTier]}
              className="mt-1"
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ContributingFactors({ hotspot }: { hotspot: Hotspot }) {
  if (hotspot.factors.length === 0) {
    return (
      <Card className="p-4">
        <SectionHeading title="Contributing factors" />
        <p className="mt-2 text-xs leading-relaxed text-ink-500">
          Land-cover sampling did not return data for this footprint, so the surface drivers of
          this hotspot could not be attributed. The severity score and vulnerability context above
          are unaffected.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <SectionHeading
        title="Contributing factors"
        description="Share of the modelled surface contribution to this hotspot's heat."
        actions={<ProvenanceBadge provenance={hotspot.factors[0].provenance} />}
      />

      <div className="mt-3 flex h-2 overflow-hidden rounded-full">
        {hotspot.factors.map((factor) => (
          <span
            key={factor.id}
            title={`${factor.label}: ${Math.round(factor.contribution * 100)}%`}
            style={{
              width: `${factor.contribution * 100}%`,
              backgroundColor: CONTRIBUTION_COLORS[factor.contributionTier],
            }}
          />
        ))}
      </div>

      <ul className="mt-3 space-y-3">
        {hotspot.factors.map((factor) => (
          <li key={factor.id}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-ink-800">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: CONTRIBUTION_COLORS[factor.contributionTier] }}
                />
                {factor.label}
              </span>
              <span className="shrink-0 text-xs text-ink-600 tnum">
                {factor.value}
                {factor.unit === "%" ? "%" : ` ${factor.unit}`}
                <span className="ml-1.5 text-ink-400">
                  {Math.round(factor.contribution * 100)}%
                </span>
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-500">{factor.interpretation}</p>
          </li>
        ))}
      </ul>

      <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-ink-50 p-2.5 text-[10px] leading-relaxed text-ink-500">
        <Info className="mt-px h-3 w-3 shrink-0" />
        Contributions are modelled from measured land cover using a fixed linear weighting, not
        inferred from the temperature field. Two hotspots with identical temperatures can therefore
        have completely different causes and recommendations.
      </p>
    </Card>
  );
}

function VulnerabilityPanel({ hotspot }: { hotspot: Hotspot }) {
  const v = hotspot.vulnerability;

  if (!v) {
    return (
      <Card className="p-4">
        <SectionHeading title="Who is affected" />
        <p className="mt-2 text-xs leading-relaxed text-ink-500">
          Population vulnerability is unavailable for this hotspot. Set{" "}
          <code className="rounded bg-ink-100 px-1 py-0.5 text-[10px]">CENSUS_API_KEY</code> to pull
          American Community Survey demographics for the surrounding census tract. Severity is
          scored on the remaining terms in the meantime.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <SectionHeading
        title="Who is affected"
        description={v.tractName}
        actions={<ProvenanceBadge provenance={v.provenance} />}
      />

      <div className="mt-3 flex items-center gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: VULNERABILITY_COLORS[v.tier] }}
        >
          {v.score}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold capitalize text-ink-900">{v.tier} vulnerability</p>
          {v.estimatedPeopleInHotspot !== undefined && (
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-500">
              <Users className="h-3 w-3" />
              approx. {formatNumber(v.estimatedPeopleInHotspot)} residents inside this footprint
            </p>
          )}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
        {v.percentOver65 !== undefined && (
          <MiniStat label="Aged 65+" value={formatPercent(v.percentOver65, 1)} />
        )}
        {v.percentBelowPoverty !== undefined && (
          <MiniStat label="Below poverty" value={formatPercent(v.percentBelowPoverty, 1)} />
        )}
        {v.percentNoVehicle !== undefined && (
          <MiniStat label="No vehicle" value={formatPercent(v.percentNoVehicle, 1)} />
        )}
        {v.populationDensityPerSqMi !== undefined && (
          <MiniStat
            label="Density"
            value={`${formatCompactNumber(v.populationDensityPerSqMi)}/mi²`}
          />
        )}
        {v.medianHouseholdIncome !== undefined && (
          <MiniStat
            label="Median income"
            value={`$${formatCompactNumber(v.medianHouseholdIncome)}`}
          />
        )}
        {v.population !== undefined && (
          <MiniStat label="Tract population" value={formatNumber(v.population)} />
        )}
      </dl>

      <p className="mt-3 text-[10px] leading-relaxed text-ink-400">
        Residents inside the footprint are apportioned from tract density by area, so treat the
        figure as an order-of-magnitude estimate rather than a count.
      </p>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-ink-900 tnum">{value}</dd>
    </div>
  );
}

const COST_TONE = {
  quick_win: "accent",
  programmatic: "info",
  capital_project: "violet",
} as const;

const IMPACT_TONE = {
  high: "danger",
  medium: "warn",
  low: "neutral",
} as const;

export function RecommendationCard({
  recommendation,
  index,
}: {
  recommendation: Recommendation;
  index: number;
}) {
  const hasCooling = recommendation.expectedCoolingC[1] > 0;

  return (
    <li className="rounded-lg border border-ink-200 p-3 print-avoid-break">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-900 text-[10px] font-semibold text-white">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-xs font-semibold text-ink-900">{recommendation.title}</h4>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge tone={COST_TONE[recommendation.costTier]}>
              <CircleDollarSign className="h-3 w-3" />
              {COST_TIER_LABELS[recommendation.costTier]}
            </Badge>
            <Badge tone={IMPACT_TONE[recommendation.impactTier]}>
              {IMPACT_TIER_LABELS[recommendation.impactTier]}
            </Badge>
            {hasCooling && (
              <Badge tone="neutral">
                <Leaf className="h-3 w-3" />
                −{recommendation.expectedCoolingC[0]} to −{recommendation.expectedCoolingC[1]} °C
              </Badge>
            )}
          </div>

          <p className="mt-2 text-[11px] leading-relaxed text-ink-700">{recommendation.action}</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500">
            {recommendation.rationale}
          </p>

          <dl className="mt-2.5 grid gap-1.5 border-t border-ink-100 pt-2.5 text-[10px] text-ink-500 sm:grid-cols-2">
            <div className="flex gap-1.5">
              <dt className="flex shrink-0 items-center gap-1 font-medium text-ink-600">
                <Banknote className="h-3 w-3" />
                Cost
              </dt>
              <dd>{recommendation.costBand}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="flex shrink-0 items-center gap-1 font-medium text-ink-600">
                <Clock className="h-3 w-3" />
                Timeframe
              </dt>
              <dd>{recommendation.timeframe}</dd>
            </div>
          </dl>

          <details className="mt-2 text-[10px]">
            <summary className="cursor-pointer font-medium text-ink-500 transition hover:text-ink-800">
              Why this was recommended
            </summary>
            <div className="mt-1.5 space-y-1.5 rounded-md bg-ink-50 p-2 leading-relaxed text-ink-500">
              <p>
                <span className="font-medium text-ink-600">Triggered by: </span>
                {recommendation.triggeredBy.join(" · ")}
              </p>
              <p>{recommendation.evidence}</p>
            </div>
          </details>
        </div>
      </div>
    </li>
  );
}

function Recommendations({ recommendations }: { recommendations: Recommendation[] }) {
  const quickWins = recommendations.filter((r) => r.costTier === "quick_win").length;

  return (
    <Card className="p-4">
      <SectionHeading
        title="Recommended interventions"
        description={
          quickWins > 0
            ? `${recommendations.length} measures, ranked by priority. ${quickWins} can be deployed before the next heat season.`
            : `${recommendations.length} measures, ranked by priority.`
        }
      />
      <ol className={cn("mt-3 space-y-2.5")}>
        {recommendations.map((recommendation, index) => (
          <RecommendationCard
            key={recommendation.id}
            recommendation={recommendation}
            index={index}
          />
        ))}
      </ol>
    </Card>
  );
}
