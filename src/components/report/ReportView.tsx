"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  FlaskConical,
  Loader2,
  Printer,
  Thermometer,
} from "lucide-react";
import { RecommendationCard } from "@/components/dashboard/HotspotDetail";
import { Badge, ProvenanceBadge } from "@/components/ui/Badge";
import { Card, Divider, EmptyState, SectionHeading, Skeleton } from "@/components/ui/Primitives";
import { SEVERITY_COLORS, SEVERITY_LABELS, VULNERABILITY_COLORS } from "@/lib/colors";
import { loadAnalysisLocally } from "@/lib/clientStore";
import {
  formatArea,
  formatCompactNumber,
  formatDelta,
  formatNumber,
  formatPercent,
  formatTemperatureDual,
} from "@/lib/format";
import { buildReportPdf, reportFileName } from "@/lib/report/pdf";
import { renderStaticMap } from "@/lib/report/staticMap";
import type { AnalysisResult } from "@/lib/types";

export default function ReportView({ analysisId }: { analysisId: string }) {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [missingHint, setMissingHint] = useState<string | null>(null);
  const [mapImage, setMapImage] = useState<string | null>(null);
  const [pdfState, setPdfState] = useState<"idle" | "building" | "error">("idle");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(`/api/analysis/${analysisId}`);
        if (response.ok) {
          const body = (await response.json()) as AnalysisResult;
          if (!cancelled) {
            setAnalysis(body);
            setStatus("ready");
          }
          return;
        }
        const body = await response.json().catch(() => ({}));
        if (!cancelled) setMissingHint(body.hint ?? null);
      } catch {
      }

      const local = loadAnalysisLocally(analysisId);
      if (!cancelled) {
        if (local) {
          setAnalysis(local);
          setStatus("ready");
        } else {
          setStatus("missing");
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [analysisId]);

  useEffect(() => {
    if (!analysis) return;
    let cancelled = false;

    void renderStaticMap({
      bbox: analysis.bbox,
      tiles: analysis.grid.tiles,
      hotspots: analysis.hotspots,
      width: 900,
      height: 500,
      pixelRatio: 2,
    }).then((image) => {
      if (!cancelled) setMapImage(image);
    });

    return () => {
      cancelled = true;
    };
  }, [analysis]);

  const demoSources = useMemo(
    () => analysis?.dataQuality.provenance.filter((p) => p.status === "demo") ?? [],
    [analysis],
  );

  const analysisUrl = useMemo(() => {
    if (!analysis) return "/dashboard";
    const params = new URLSearchParams();
    if (analysis.id) {
      params.set("id", analysis.id);
    }
    if (analysis.request?.center) {
      params.set("lat", analysis.request.center.lat.toFixed(6));
      params.set("lng", analysis.request.center.lng.toFixed(6));
    }
    if (analysis.placeLabel) {
      params.set("label", analysis.placeLabel);
    }
    return `/dashboard?${params.toString()}`;
  }, [analysis]);

  const handleDownloadPdf = async () => {
    if (!analysis) return;
    setPdfState("building");
    try {
      const blob = await buildReportPdf(analysis);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = reportFileName(analysis);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setPdfState("idle");
    } catch {
      setPdfState("error");
    }
  };

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-6 py-12">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (status === "missing" || !analysis) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20">
        <EmptyState
          icon={<AlertTriangle className="h-7 w-7" />}
          title="This report is no longer available"
          description={
            missingHint ??
            "Saved analyses expire after seven days. Re-run the analysis from the dashboard to generate a fresh report."
          }
          action={
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-lg bg-ink-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-ink-800"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Start new analysis
            </Link>
          }
        />
      </div>
    );
  }

  const { summary } = analysis;

  return (
    <div className="min-h-dvh bg-ink-50 print:bg-white">
      <header className="no-print sticky top-0 z-50 border-b border-ink-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-6 py-3">
          <Link
            href={analysisUrl}
            className="flex items-center gap-1.5 text-xs font-medium text-ink-500 transition hover:text-ink-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to analysis
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 transition hover:border-ink-300 hover:text-ink-900"
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={pdfState === "building"}
              className="flex items-center gap-1.5 rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-ink-800 disabled:opacity-60"
            >
              {pdfState === "building" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {pdfState === "building" ? "Building…" : "Download PDF"}
            </button>
          </div>
        </div>
        {pdfState === "error" && (
          <p className="border-t border-red-200 bg-red-50 px-6 py-2 text-center text-xs text-red-800">
            The PDF could not be generated in this browser. Use Print instead and choose
            &ldquo;Save as PDF&rdquo;.
          </p>
        )}
      </header>

      <main className="mx-auto max-w-4xl space-y-4 px-6 py-8 print:max-w-none print:space-y-3 print:px-0 print:py-0">
        <Card className="p-6 print:border-0 print:p-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-accent-700">
                <Thermometer className="h-3.5 w-3.5" />
                HeatLens urban heat assessment
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900">
                {analysis.placeLabel}
              </h1>
              <p className="mt-1 text-sm text-ink-500">
                {analysis.resolvedDateTime.label} · {summary.areaSqMiles.toFixed(2)} mi² at{" "}
                {summary.granularityMeters} m resolution
              </p>
            </div>
            <p className="shrink-0 text-right text-[11px] text-ink-400">
              Generated
              <br />
              {new Date(analysis.createdAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </p>
          </div>

          {demoSources.length > 0 && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <FlaskConical className="mt-px h-4 w-4 shrink-0 text-amber-700" />
              <p className="text-xs leading-relaxed text-amber-900">
                <span className="font-semibold">Demonstration data.</span>{" "}
                {demoSources.map((s) => s.source).join(", ")} produced simulated values for this
                report. Figures are internally consistent and suitable for evaluating the product,
                but they are not measurements.
              </p>
            </div>
          )}

          <Divider className="my-5" />

          <dl className="grid grid-cols-2 gap-5 sm:grid-cols-5">
            <ReportStat label="Area mean" value={formatTemperatureDual(summary.meanTempC)} />
            <ReportStat label="Hottest" value={formatTemperatureDual(summary.peakTempC)} />
            <ReportStat
              label="Heat gap"
              value={formatDelta(summary.heatGapC)}
              sub="hottest vs. coolest"
            />
            <ReportStat
              label={`Above ${summary.thresholdC}°C`}
              value={formatPercent(summary.shareAboveThreshold * 100)}
              sub="of the area"
            />
            <ReportStat label="Hotspots" value={String(analysis.hotspots.length)} />
          </dl>
        </Card>

        <Card className="p-6">
          <SectionHeading
            title="Executive summary"
            actions={
              <Badge tone={analysis.insights.generator === "llm" ? "violet" : "neutral"}>
                {analysis.insights.generator === "llm" ? "AI-phrased" : "Rule-based"}
              </Badge>
            }
          />
          <p className="mt-3 text-base font-medium leading-relaxed text-ink-900">
            {analysis.insights.headline}
          </p>
          <p className="mt-2.5 text-sm leading-relaxed text-ink-600">
            {analysis.insights.narrative}
          </p>
          {analysis.insights.keyFindings.length > 0 && (
            <ul className="mt-4 space-y-2 border-t border-ink-100 pt-4">
              {analysis.insights.keyFindings.map((finding) => (
                <li key={finding} className="flex gap-2.5 text-sm leading-relaxed text-ink-700">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500" />
                  {finding}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="p-6 pb-3">
            <SectionHeading
              title="Heat map"
              description="Colour is scaled to this area's own range so within-area contrast stays visible. Numbered pins mark detected hotspots in severity order."
              actions={<ProvenanceBadge provenance={analysis.grid.provenance} />}
            />
          </div>
          {mapImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mapImage}
              alt={`Heat map of ${analysis.placeLabel} showing ${analysis.hotspots.length} detected hotspots`}
              className="w-full"
            />
          ) : (
            <div className="flex h-64 items-center justify-center bg-ink-100">
              <Loader2 className="h-5 w-5 animate-spin text-ink-400" />
            </div>
          )}
        </Card>

        {analysis.hotspots.length === 0 ? (
          <Card className="p-6">
            <SectionHeading title="Hotspots" />
            <p className="mt-2 text-sm leading-relaxed text-ink-600">
              {analysis.dataQuality.caveats[0] ??
                "No statistically distinct hotspots were detected in this area at the analysed time."}
            </p>
          </Card>
        ) : (
          analysis.hotspots.map((hotspot) => (
            <Card key={hotspot.id} className="p-6 print-break-before">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                    style={{ backgroundColor: SEVERITY_COLORS[hotspot.severityTier] }}
                  >
                    {hotspot.rank}
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-ink-900">
                      {hotspot.addressLabel ?? `Hotspot ${hotspot.rank}`}
                    </h2>
                    <p className="mt-0.5 text-[11px] text-ink-400 tnum">
                      {hotspot.center.lat.toFixed(5)}, {hotspot.center.lng.toFixed(5)} ·{" "}
                      {formatArea(hotspot.areaSqMeters)}
                    </p>
                  </div>
                </div>
                <span
                  className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold text-white"
                  style={{ backgroundColor: SEVERITY_COLORS[hotspot.severityTier] }}
                >
                  {SEVERITY_LABELS[hotspot.severityTier]} · {hotspot.severityScore}
                </span>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <ReportStat label="Mean" value={formatTemperatureDual(hotspot.meanTempC)} />
                <ReportStat label="Peak" value={formatTemperatureDual(hotspot.peakTempC)} />
                <ReportStat
                  label="Above baseline"
                  value={formatDelta(hotspot.anomalyC)}
                  sub={`${hotspot.zScore.toFixed(1)}σ`}
                />
                {hotspot.exceedanceHours !== undefined && (
                  <ReportStat
                    label="Hours above"
                    value={`${hotspot.exceedanceHours} h`}
                    sub={
                      analysis.exposureWindow
                        ? analysis.exposureWindow.localLabel
                        : `over ${summary.thresholdC} °C`
                    }
                  />
                )}
              </dl>

              {hotspot.factors.length > 0 && (
                <div className="mt-5 border-t border-ink-100 pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                    Why it is hot
                  </h3>
                  <ul className="mt-2.5 space-y-2.5">
                    {hotspot.factors.map((factor) => (
                      <li key={factor.id}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-sm font-medium text-ink-800">{factor.label}</span>
                          <span className="shrink-0 text-sm text-ink-600 tnum">
                            {factor.value}
                            {factor.unit === "%" ? "%" : ` ${factor.unit}`}
                            <span className="ml-2 text-ink-400">
                              {Math.round(factor.contribution * 100)}% of contribution
                            </span>
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
                          {factor.interpretation}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {hotspot.vulnerability && (
                <div className="mt-5 border-t border-ink-100 pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                      Who is affected
                    </h3>
                    <ProvenanceBadge provenance={hotspot.vulnerability.provenance} />
                  </div>
                  <div className="mt-2.5 flex items-center gap-3">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                      style={{ backgroundColor: VULNERABILITY_COLORS[hotspot.vulnerability.tier] }}
                    >
                      {hotspot.vulnerability.score}
                    </span>
                    <p className="text-sm leading-relaxed text-ink-600">
                      <span className="font-medium capitalize text-ink-900">
                        {hotspot.vulnerability.tier} vulnerability
                      </span>{" "}
                      in {hotspot.vulnerability.tractName ?? "the surrounding tract"}.{" "}
                      {hotspot.vulnerability.estimatedPeopleInHotspot !== undefined && (
                        <>
                          An estimated{" "}
                          {formatNumber(hotspot.vulnerability.estimatedPeopleInHotspot)} residents
                          live inside this footprint.{" "}
                        </>
                      )}
                      {hotspot.vulnerability.percentOver65 !== undefined && (
                        <>{hotspot.vulnerability.percentOver65.toFixed(1)}% are aged 65 or over</>
                      )}
                      {hotspot.vulnerability.percentBelowPoverty !== undefined && (
                        <>
                          {" "}
                          and {hotspot.vulnerability.percentBelowPoverty.toFixed(1)}% live below the
                          poverty line
                        </>
                      )}
                      .
                      {hotspot.vulnerability.medianHouseholdIncome !== undefined && (
                        <>
                          {" "}
                          Median household income is $
                          {formatCompactNumber(hotspot.vulnerability.medianHouseholdIncome)}.
                        </>
                      )}
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-5 border-t border-ink-100 pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  Recommended interventions
                </h3>
                <ol className="mt-2.5 space-y-2.5">
                  {hotspot.recommendations.map((recommendation, index) => (
                    <RecommendationCard
                      key={recommendation.id}
                      recommendation={recommendation}
                      index={index}
                    />
                  ))}
                </ol>
              </div>
            </Card>
          ))
        )}

        <Card className="p-6 print-break-before">
          <SectionHeading
            title="Data sources and methodology"
            description="Every figure in this report is traceable to one of these."
          />

          <ul className="mt-4 space-y-3">
            {analysis.dataQuality.provenance.map((entry) => (
              <li
                key={`${entry.source}-${entry.status}`}
                className="flex items-start justify-between gap-3 border-b border-ink-100 pb-3 last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900">{entry.source}</p>
                  {entry.note && (
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{entry.note}</p>
                  )}
                </div>
                <ProvenanceBadge provenance={entry} className="shrink-0" />
              </li>
            ))}
          </ul>

          <div className="mt-5 space-y-4 border-t border-ink-100 pt-4">
            <Method
              title="How hotspots are detected"
              body="A measurement cell is flagged when it exceeds the area's own mean by at least one standard deviation. Flagged cells are flood-filled into contiguous clusters, and clusters smaller than three cells are discarded as noise. Detection is relative to the surrounding area rather than to a fixed temperature, so it behaves consistently across climates and seasons."
            />
            <Method
              title="How severity is scored"
              body="Severity combines thermal intensity against the area baseline, hours above the heat-risk threshold, absolute peak temperature against National Weather Service heat bands, and population vulnerability from the American Community Survey. Terms without data are dropped and the remaining weights renormalised rather than scored as zero."
            />
            <Method
              title="How recommendations are produced"
              body="A deterministic rules engine keyed on each hotspot's measured contributing factors, exposure duration and vulnerability. Expected cooling ranges are near-surface air temperature reductions from urban heat island field studies, not surface temperature reductions. A language model, where configured, only phrases findings that have already been computed."
            />
          </div>

          {analysis.dataQuality.caveats.length > 0 && (
            <div className="mt-5 rounded-lg bg-ink-50 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                Caveats
              </h3>
              <ul className="mt-2 space-y-1.5">
                {analysis.dataQuality.caveats.map((caveat) => (
                  <li key={caveat} className="text-xs leading-relaxed text-ink-500">
                    · {caveat}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <p className="pb-6 text-center text-[11px] text-ink-400">
          Prepared with HeatLens · Temperature data © FortyGuard · Base map © OpenStreetMap
          contributors
        </p>
      </main>
    </div>
  );
}

function ReportStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="mt-1 text-base font-semibold text-ink-900 tnum">{value}</dd>
      {sub && <p className="text-[10px] text-ink-400">{sub}</p>}
    </div>
  );
}

function Method({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-ink-600">{body}</p>
    </div>
  );
}
