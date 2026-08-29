import { jsPDF } from "jspdf";
import { COST_TIER_LABELS, IMPACT_TIER_LABELS } from "@/lib/analysis/recommendations";
import { SEVERITY_LABELS } from "@/lib/colors";
import { celsiusToFahrenheit, formatArea, formatNumber } from "@/lib/format";
import { renderStaticMap } from "@/lib/report/staticMap";
import type { AnalysisResult } from "@/lib/types";

/**
 * Builds the downloadable PDF brief.
 *
 * Composed as vector text and shapes with jsPDF rather than rasterising the DOM.
 * The output is a fraction of the size, the text stays selectable and
 * searchable, and it does not depend on the browser's print settings — which
 * matters when the deliverable is going to be attached to a committee paper.
 */

const PAGE = { width: 210, height: 297 };
const MARGIN = { left: 15, right: 15, top: 16, bottom: 16 };
const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right;

const INK = { r: 21, g: 26, b: 33 };
const MUTED = { r: 91, g: 102, b: 120 };
const FAINT = { r: 176, g: 185, b: 199 };
const ACCENT = { r: 13, g: 133, b: 126 };

const SEVERITY_RGB: Record<string, [number, number, number]> = {
  critical: [165, 0, 38],
  high: [227, 74, 51],
  moderate: [242, 165, 65],
  watch: [106, 159, 181],
};

class Doc {
  readonly pdf: jsPDF;
  y: number;

  constructor() {
    this.pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
    this.pdf.setFont("helvetica", "normal");
    this.y = MARGIN.top;
  }

  /** Start a new page when `needed` millimetres will not fit below the cursor. */
  ensure(needed: number): void {
    if (this.y + needed <= PAGE.height - MARGIN.bottom) return;
    this.pdf.addPage();
    this.y = MARGIN.top;
  }

  text(
    content: string,
    options: {
      size?: number;
      style?: "normal" | "bold" | "italic";
      color?: { r: number; g: number; b: number };
      width?: number;
      lineHeight?: number;
      x?: number;
      gapAfter?: number;
    } = {},
  ): void {
    const size = options.size ?? 9;
    const lineHeight = options.lineHeight ?? size * 0.42;
    const width = options.width ?? CONTENT_WIDTH;
    const x = options.x ?? MARGIN.left;
    const color = options.color ?? INK;

    this.pdf.setFont("helvetica", options.style ?? "normal");
    this.pdf.setFontSize(size);
    this.pdf.setTextColor(color.r, color.g, color.b);

    const lines = this.pdf.splitTextToSize(content, width) as string[];
    for (const line of lines) {
      this.ensure(lineHeight + 1);
      this.pdf.text(line, x, this.y);
      this.y += lineHeight;
    }
    this.y += options.gapAfter ?? 0;
  }

  rule(gap = 3): void {
    this.ensure(gap + 1);
    this.y += gap / 2;
    this.pdf.setDrawColor(FAINT.r, FAINT.g, FAINT.b);
    this.pdf.setLineWidth(0.2);
    this.pdf.line(MARGIN.left, this.y, PAGE.width - MARGIN.right, this.y);
    this.y += gap;
  }

  heading(label: string): void {
    this.ensure(12);
    this.y += 3;
    this.text(label.toUpperCase(), { size: 7.5, style: "bold", color: ACCENT, lineHeight: 3.2 });
    this.y += 1.5;
  }
}

function tempPair(celsius: number, precision = 1): string {
  return `${celsius.toFixed(precision)} \u00B0C / ${celsiusToFahrenheit(celsius).toFixed(0)} \u00B0F`;
}

function drawStatRow(
  doc: Doc,
  stats: { label: string; value: string; sub?: string }[],
): void {
  const columnWidth = CONTENT_WIDTH / stats.length;
  doc.ensure(16);
  const top = doc.y;

  stats.forEach((stat, index) => {
    const x = MARGIN.left + index * columnWidth;

    doc.pdf.setFont("helvetica", "normal");
    doc.pdf.setFontSize(6.8);
    doc.pdf.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.pdf.text(stat.label.toUpperCase(), x, top);

    doc.pdf.setFont("helvetica", "bold");
    doc.pdf.setFontSize(11);
    doc.pdf.setTextColor(INK.r, INK.g, INK.b);
    doc.pdf.text(stat.value, x, top + 5);

    if (stat.sub) {
      doc.pdf.setFont("helvetica", "normal");
      doc.pdf.setFontSize(6.5);
      doc.pdf.setTextColor(FAINT.r, FAINT.g, FAINT.b);
      doc.pdf.text(
        doc.pdf.splitTextToSize(stat.sub, columnWidth - 3)[0] as string,
        x,
        top + 9,
      );
    }
  });

  doc.y = top + 14;
}

export async function buildReportPdf(analysis: AnalysisResult): Promise<Blob> {
  const doc = new Doc();
  const { pdf } = doc;

  /* ----------------------------- Cover header ----------------------------- */

  pdf.setFillColor(INK.r, INK.g, INK.b);
  pdf.rect(0, 0, PAGE.width, 30, "F");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.setTextColor(255, 255, 255);
  pdf.text("Urban Heat Assessment", MARGIN.left, 14);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(168, 235, 224);
  pdf.text("HeatLens \u00B7 Urban Heat Intelligence", MARGIN.left, 21.5);

  pdf.setFontSize(7);
  pdf.setTextColor(200, 210, 220);
  pdf.text(
    `Generated ${new Date(analysis.createdAt).toLocaleString("en-US")}`,
    PAGE.width - MARGIN.right,
    21.5,
    { align: "right" },
  );

  doc.y = 40;

  doc.text(analysis.placeLabel, { size: 13, style: "bold", lineHeight: 5.5 });
  doc.text(
    `${analysis.resolvedDateTime.label}  \u00B7  ${analysis.summary.areaSqMiles.toFixed(2)} sq mi at ${analysis.summary.granularityMeters} m resolution  \u00B7  ${analysis.summary.tileCount.toLocaleString()} measurement cells${
      analysis.exposureWindow ? `  \u00B7  exposure window ${analysis.exposureWindow.localLabel}` : ""
    }`,
    { size: 8, color: MUTED, gapAfter: 2 },
  );

  const demoSources = analysis.dataQuality.provenance.filter((p) => p.status === "demo");
  if (demoSources.length > 0) {
    doc.ensure(12);
    pdf.setFillColor(254, 243, 199);
    pdf.setDrawColor(252, 211, 77);
    pdf.roundedRect(MARGIN.left, doc.y - 1, CONTENT_WIDTH, 9, 1.5, 1.5, "FD");
    doc.y += 4;
    doc.text(
      `Demonstration data: ${demoSources.map((s) => s.source).join(", ")}. Figures in this report are simulated, not measured.`,
      { size: 7.5, style: "bold", color: { r: 146, g: 64, b: 14 }, x: MARGIN.left + 3, width: CONTENT_WIDTH - 6, lineHeight: 3.2 },
    );
    doc.y += 4;
  }

  /* ------------------------------- Summary -------------------------------- */

  doc.heading("Executive summary");
  doc.text(analysis.insights.headline, { size: 10, style: "bold", lineHeight: 4.4, gapAfter: 2 });
  doc.text(analysis.insights.narrative, { size: 8.5, color: MUTED, lineHeight: 4, gapAfter: 3 });

  drawStatRow(doc, [
    { label: "Area mean", value: tempPair(analysis.summary.meanTempC) },
    { label: "Hottest", value: tempPair(analysis.summary.peakTempC) },
    { label: "Heat gap", value: `${analysis.summary.heatGapC.toFixed(1)} \u00B0C`, sub: "hottest vs coolest" },
    {
      label: `Above ${analysis.summary.thresholdC} \u00B0C`,
      value: `${Math.round(analysis.summary.shareAboveThreshold * 100)}%`,
      sub: "of the area",
    },
    { label: "Hotspots", value: String(analysis.hotspots.length) },
  ]);

  if (analysis.insights.keyFindings.length > 0) {
    doc.rule(3);
    doc.heading("Key findings");
    for (const finding of analysis.insights.keyFindings) {
      doc.ensure(5);
      pdf.setFillColor(ACCENT.r, ACCENT.g, ACCENT.b);
      pdf.circle(MARGIN.left + 1, doc.y - 1.1, 0.7, "F");
      doc.text(finding, { size: 8.5, x: MARGIN.left + 4.5, width: CONTENT_WIDTH - 4.5, lineHeight: 3.9, gapAfter: 1 });
    }
  }

  /* --------------------------------- Map ---------------------------------- */

  const mapImage = await renderStaticMap({
    bbox: analysis.bbox,
    tiles: analysis.grid.tiles,
    hotspots: analysis.hotspots,
    width: 560,
    height: 340,
  });

  if (mapImage) {
    const imageHeight = (CONTENT_WIDTH * 340) / 560;
    doc.ensure(imageHeight + 12);
    doc.rule(3);
    doc.heading("Heat map");
    pdf.addImage(mapImage, "PNG", MARGIN.left, doc.y, CONTENT_WIDTH, imageHeight);
    doc.y += imageHeight + 2;
    doc.text(
      `Air temperature at ${analysis.resolvedDateTime.label}. Colour is scaled to this area's own range; numbered pins mark detected hotspots in severity order.`,
      { size: 7, color: FAINT, lineHeight: 3, gapAfter: 1 },
    );
  }

  /* ------------------------------- Hotspots -------------------------------- */

  if (analysis.hotspots.length === 0) {
    doc.rule(3);
    doc.heading("Hotspots");
    doc.text(
      analysis.dataQuality.caveats[0] ??
        "No statistically distinct hotspots were detected in this area at the analysed time.",
      { size: 8.5, color: MUTED, lineHeight: 4 },
    );
  }

  for (const hotspot of analysis.hotspots) {
    pdf.addPage();
    doc.y = MARGIN.top;

    const rgb = SEVERITY_RGB[hotspot.severityTier] ?? SEVERITY_RGB.watch;

    pdf.setFillColor(rgb[0], rgb[1], rgb[2]);
    pdf.circle(MARGIN.left + 3.5, doc.y + 1.5, 3.5, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(255, 255, 255);
    pdf.text(String(hotspot.rank), MARGIN.left + 3.5, doc.y + 2.8, { align: "center" });

    pdf.setFontSize(11.5);
    pdf.setTextColor(INK.r, INK.g, INK.b);
    pdf.text(
      pdf.splitTextToSize(
        hotspot.addressLabel ?? `Hotspot ${hotspot.rank}`,
        CONTENT_WIDTH - 45,
      )[0] as string,
      MARGIN.left + 10,
      doc.y + 3,
    );

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(rgb[0], rgb[1], rgb[2]);
    pdf.text(
      `${SEVERITY_LABELS[hotspot.severityTier]} \u00B7 severity ${hotspot.severityScore}/100`,
      PAGE.width - MARGIN.right,
      doc.y + 3,
      { align: "right" },
    );

    doc.y += 9;
    doc.text(`${hotspot.center.lat.toFixed(5)}, ${hotspot.center.lng.toFixed(5)}`, {
      size: 7,
      color: FAINT,
      lineHeight: 3,
      gapAfter: 3,
    });

    drawStatRow(doc, [
      { label: "Mean", value: tempPair(hotspot.meanTempC) },
      { label: "Peak", value: tempPair(hotspot.peakTempC) },
      {
        label: "Above baseline",
        value: `+${hotspot.anomalyC.toFixed(1)} \u00B0C`,
        sub: `${hotspot.zScore.toFixed(1)} std dev`,
      },
      { label: "Footprint", value: formatArea(hotspot.areaSqMeters) },
      ...(hotspot.exceedanceHours !== undefined
        ? [
            {
              label: "Hours above",
              value: `${hotspot.exceedanceHours} h`,
              sub: analysis.exposureWindow?.localLabel ?? `over ${analysis.summary.thresholdC} \u00B0C`,
            },
          ]
        : []),
    ]);

    doc.rule(2);

    if (hotspot.factors.length > 0) {
      doc.heading("Why it is hot");
      for (const factor of hotspot.factors) {
        doc.ensure(9);
        const barTop = doc.y - 2.2;
        const barWidth = 34;

        pdf.setFillColor(236, 238, 242);
        pdf.roundedRect(MARGIN.left, barTop, barWidth, 2.4, 1.2, 1.2, "F");
        pdf.setFillColor(rgb[0], rgb[1], rgb[2]);
        pdf.roundedRect(
          MARGIN.left,
          barTop,
          Math.max(1.4, barWidth * factor.contribution),
          2.4,
          1.2,
          1.2,
          "F",
        );

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8);
        pdf.setTextColor(INK.r, INK.g, INK.b);
        pdf.text(
          `${factor.label}: ${factor.value}${factor.unit === "%" ? "%" : ` ${factor.unit}`} (${Math.round(
            factor.contribution * 100,
          )}%)`,
          MARGIN.left + barWidth + 4,
          doc.y,
        );

        doc.y += 4;
        doc.text(factor.interpretation, {
          size: 7.5,
          color: MUTED,
          x: MARGIN.left + barWidth + 4,
          width: CONTENT_WIDTH - barWidth - 4,
          lineHeight: 3.2,
          gapAfter: 2,
        });
      }
      doc.rule(2);
    }

    const v = hotspot.vulnerability;
    if (v) {
      doc.heading("Who is affected");
      doc.text(
        `${v.tractName ?? "Surrounding census tract"} \u2014 vulnerability ${v.score}/100 (${v.tier})`,
        { size: 8.5, style: "bold", lineHeight: 3.8, gapAfter: 1.5 },
      );

      const parts = [
        v.estimatedPeopleInHotspot !== undefined
          ? `approx. ${formatNumber(v.estimatedPeopleInHotspot)} residents inside the footprint`
          : null,
        v.percentOver65 !== undefined ? `${v.percentOver65.toFixed(1)}% aged 65+` : null,
        v.percentBelowPoverty !== undefined
          ? `${v.percentBelowPoverty.toFixed(1)}% below the poverty line`
          : null,
        v.percentNoVehicle !== undefined
          ? `${v.percentNoVehicle.toFixed(1)}% of households without a vehicle`
          : null,
        v.populationDensityPerSqMi !== undefined
          ? `${formatNumber(v.populationDensityPerSqMi)} people per sq mi`
          : null,
      ].filter(Boolean);

      doc.text(parts.join("  \u00B7  "), { size: 8, color: MUTED, lineHeight: 3.6, gapAfter: 1 });
      doc.text(
        "Residents inside the footprint are apportioned from tract density by area and are an order-of-magnitude estimate.",
        { size: 6.8, color: FAINT, lineHeight: 2.9 },
      );
      doc.rule(2);
    }

    doc.heading("Recommended interventions");
    hotspot.recommendations.forEach((recommendation, index) => {
      doc.ensure(24);

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(INK.r, INK.g, INK.b);
      pdf.text(`${index + 1}. ${recommendation.title}`, MARGIN.left, doc.y);

      const tags = [
        COST_TIER_LABELS[recommendation.costTier],
        IMPACT_TIER_LABELS[recommendation.impactTier],
        recommendation.expectedCoolingC[1] > 0
          ? `\u2212${recommendation.expectedCoolingC[0]} to \u2212${recommendation.expectedCoolingC[1]} \u00B0C`
          : null,
      ].filter(Boolean) as string[];

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      pdf.setTextColor(ACCENT.r, ACCENT.g, ACCENT.b);
      pdf.text(tags.join("  \u00B7  "), PAGE.width - MARGIN.right, doc.y, { align: "right" });

      doc.y += 4;
      doc.text(recommendation.action, {
        size: 8,
        color: MUTED,
        lineHeight: 3.5,
        gapAfter: 1,
      });
      doc.text(recommendation.rationale, {
        size: 7.5,
        color: MUTED,
        style: "italic",
        lineHeight: 3.3,
        gapAfter: 1,
      });
      doc.text(
        `Cost: ${recommendation.costBand}.  Timeframe: ${recommendation.timeframe}.  Triggered by: ${recommendation.triggeredBy.join(", ")}.`,
        { size: 6.8, color: FAINT, lineHeight: 2.9, gapAfter: 3 },
      );
    });
  }

  /* ---------------------------- Methodology page --------------------------- */

  pdf.addPage();
  doc.y = MARGIN.top;
  doc.text("Data sources and methodology", { size: 12, style: "bold", lineHeight: 5, gapAfter: 3 });

  doc.heading("Sources used in this report");
  for (const entry of analysis.dataQuality.provenance) {
    doc.ensure(9);
    doc.text(`${entry.source} \u2014 ${entry.status}`, {
      size: 8.5,
      style: "bold",
      lineHeight: 3.6,
    });
    if (entry.note) {
      doc.text(entry.note, { size: 7.5, color: MUTED, lineHeight: 3.2, gapAfter: 1.5 });
    }
  }

  doc.rule(2);
  doc.heading("How hotspots are detected");
  doc.text(
    "A measurement cell is flagged when it exceeds the area's own mean by at least one standard deviation. Flagged cells are flood-filled into contiguous clusters and clusters smaller than three cells are discarded as noise. Detection is relative to the surrounding area rather than to a fixed temperature, so it behaves consistently across climates and seasons; absolute public-health thresholds are applied separately in the severity score.",
    { size: 8, color: MUTED, lineHeight: 3.6, gapAfter: 2 },
  );

  doc.heading("How severity is scored");
  doc.text(
    "Severity combines thermal intensity relative to the area baseline, hours spent above the heat-risk threshold, absolute peak temperature against National Weather Service heat bands, and population vulnerability from the American Community Survey. Any term without data is dropped and the remaining weights renormalised, rather than being scored as zero.",
    { size: 8, color: MUTED, lineHeight: 3.6, gapAfter: 2 },
  );

  doc.heading("How recommendations are produced");
  doc.text(
    "Recommendations come from a deterministic rules engine keyed on the measured contributing factors, exposure duration and vulnerability of each hotspot. Expected cooling ranges are near-surface air temperature reductions reported in urban heat island field studies, not surface temperature reductions. Where a language model is configured it is used only to phrase findings that have already been computed; it is never asked to produce a number.",
    { size: 8, color: MUTED, lineHeight: 3.6, gapAfter: 2 },
  );

  if (analysis.dataQuality.caveats.length > 0) {
    doc.heading("Caveats");
    for (const caveat of analysis.dataQuality.caveats) {
      doc.text(`\u2022  ${caveat}`, { size: 7.8, color: MUTED, lineHeight: 3.3, gapAfter: 0.8 });
    }
  }

  /* -------------------------------- Footers -------------------------------- */

  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.5);
    pdf.setTextColor(FAINT.r, FAINT.g, FAINT.b);
    pdf.text(
      `HeatLens \u00B7 ${analysis.placeLabel} \u00B7 ${analysis.resolvedDateTime.label}`,
      MARGIN.left,
      PAGE.height - 8,
    );
    pdf.text(`${page} / ${pageCount}`, PAGE.width - MARGIN.right, PAGE.height - 8, {
      align: "right",
    });
  }

  return pdf.output("blob");
}

export function reportFileName(analysis: AnalysisResult): string {
  const slug = analysis.placeLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  const date = analysis.resolvedDateTime.timestamp.slice(0, 10);
  return `heatlens-${slug || "assessment"}-${date}.pdf`;
}
