import type { LandCoverProfile } from "@/lib/datasources/landcover";
import { claimZoneName } from "@/lib/analysis/placeNames";
import type {
  AggregatedRecommendation,
  AnalysisBrief,
  BriefHotZone,
  BriefIntensity,
  BriefSeverity,
  CoolZone,
  ForecastInsight,
  GreenOpportunity,
  Hotspot,
  LatLng,
  Recommendation,
  ThermalOverview,
  VegetationGap,
  VegetationInsights,
  VegetationPatch,
} from "@/lib/types";

/**
 * Turns the raw analysis into the short-form cards the dashboard shows.
 *
 * Every string here is a label, a one-liner, or a badge. Longer narrative
 * stays in `insights` for the PDF report — it does not belong on the screen.
 */

const SHORT_TITLES: Record<string, string> = {
  "street-tree-canopy": "Plant street trees",
  "shade-structures": "Install temporary shade structures",
  "misting-systems": "Deploy misting systems",
  "cool-roofs": "Develop green roofs",
  "cool-pavement": "Implement reflective roofing and pavements",
  "depave-green-infrastructure": "Create pocket parks",
  "transit-shade": "Shade transit stops",
  "cool-corridor": "Designate a cool corridor",
  "cooling-centre": "Open a cooling centre",
  "elderly-outreach": "Check in on older residents",
};

const OPPORTUNITY_ACTIONS: Record<string, string> = {
  "street-tree-canopy": "street trees",
  "shade-structures": "shade structure",
  "misting-systems": "misting",
  "cool-roofs": "green roof",
  "cool-pavement": "cool pavement",
  "depave-green-infrastructure": "pocket park",
  "cool-corridor": "cool corridor",
  "transit-shade": "transit shade",
};

function intensityFromZ(zScore: number): BriefIntensity {
  const mag = Math.abs(zScore);
  if (mag >= 1.8) return "high";
  if (mag >= 1.0) return "medium";
  return "low";
}

function severityFromHotspot(hotspot: Hotspot): BriefSeverity {
  if (hotspot.severityTier === "critical" || hotspot.peakTempC >= 43) return "extreme";
  if (hotspot.severityTier === "high" || hotspot.anomalyC >= 2.2) return "high";
  return "medium";
}

function factorValue(hotspot: Hotspot, id: Hotspot["factors"][number]["id"]): number | null {
  return hotspot.factors.find((f) => f.id === id)?.value ?? null;
}

function developmentLabel(hotspot: Hotspot): string {
  const built = factorValue(hotspot, "building_density") ?? 0;
  const canopy = factorValue(hotspot, "tree_canopy") ?? 40;
  const impervious = factorValue(hotspot, "impervious_surface") ?? 0;

  if (built >= 70 || impervious >= 85) return "dense urban";
  if (built >= 45 && canopy < 12) return "commercial";
  if (built >= 25) return "dense residential";
  if (canopy >= 20) return "mixed development";
  return "residential area";
}

function causeLabel(hotspot: Hotspot): string {
  const built = factorValue(hotspot, "building_density") ?? 0;
  const canopy = factorValue(hotspot, "tree_canopy") ?? 40;
  const impervious = factorValue(hotspot, "impervious_surface") ?? 0;
  const development = developmentLabel(hotspot);

  if (built >= 70 && canopy < 10) return "industrial area or large commercial complex";
  if (development === "commercial") return "commercial district";
  if (development === "dense residential") return "dense residential area";
  if (development === "dense urban") return "dense urban development";
  if (impervious >= 70) return "mixed development";
  return development;
}

function hotZoneDescription(hotspot: Hotspot, severity: BriefSeverity): string {
  const cause = causeLabel(hotspot);
  if (severity === "extreme") {
    return `Intense heat from ${cause}.`;
  }
  if (severity === "high") {
    return `Significant heat from ${cause} and limited vegetation.`;
  }
  return `Moderate heat from ${cause}.`;
}

function coolSource(profile: LandCoverProfile | null): string {
  if (!profile) return "open space";
  if ((profile.waterSharePct ?? 0) >= 20) return "large water body";
  if ((profile.treeCanopyPct ?? 0) >= 25 || (profile.vegetatedSharePct ?? 0) >= 50) {
    return "park space";
  }
  if ((profile.treeCanopyPct ?? 0) >= 10 || (profile.vegetatedSharePct ?? 0) >= 20) {
    return "light vegetation";
  }
  return "open space";
}

function coolDescription(source: string, intensity: BriefIntensity): string {
  if (source === "large water body") {
    return intensity === "high" ? "Significant cooling from a water body." : "Cooling from a water body.";
  }
  if (source === "park space") {
    return intensity === "high" ? "Strong cooling from park or green space." : "Moderate cooling from park space.";
  }
  if (source === "light vegetation") {
    return "Some cooling from light vegetation.";
  }
  return "Some residual cooling.";
}

export function toCoolZone(
  id: string,
  name: string,
  cluster: {
    center: CoolZone["center"];
    bbox: CoolZone["bbox"];
    polygon: CoolZone["polygon"];
    meanValue: number;
    anomaly: number;
    zScore: number;
  },
  landCover: LandCoverProfile | null,
): CoolZone {
  const intensity = intensityFromZ(cluster.zScore);
  const source = coolSource(landCover);
  return {
    id,
    name,
    center: cluster.center,
    bbox: cluster.bbox,
    polygon: cluster.polygon,
    meanTempC: cluster.meanValue,
    anomalyC: cluster.anomaly,
    intensity,
    source,
    description: coolDescription(source, intensity),
  };
}

function canopyDensity(pct: number | null): string {
  if (pct === null) return "unknown";
  if (pct >= 30) return "dense";
  if (pct >= 15) return "moderate";
  return "sparse";
}

function heatIslandSeverity(
  hotspots: Hotspot[],
  heatGapC: number,
): ThermalOverview["heatIslandSeverity"] {
  if (hotspots.some((h) => h.severityTier === "critical") || heatGapC >= 6) return "High";
  if (hotspots.some((h) => h.severityTier === "high") || heatGapC >= 3) return "Medium";
  return "Low";
}

function thermalSummary(
  hotCount: number,
  coolCount: number,
  severity: ThermalOverview["heatIslandSeverity"],
): string {
  if (hotCount === 0 && coolCount === 0) {
    return "Temperature across this area is fairly even.";
  }
  if (severity === "High") {
    return `Mix of high-heat zones${coolCount ? " with a few cool pockets" : ""}.`;
  }
  if (severity === "Medium") {
    return `Mix of high and moderate temperature zones${coolCount ? " with scattered cool areas" : ""}.`;
  }
  return coolCount > hotCount
    ? "Mostly moderate temperatures with more cool areas than hotspots."
    : "Mostly moderate temperatures with limited hotspots.";
}

function vegetationSummary(
  coveragePct: number,
  gaps: VegetationGap[],
): string {
  if (gaps.length === 0) {
    return `Approximately ${coveragePct}% of the area has vegetation.`;
  }
  const named = gaps.slice(0, 2).map((g) => g.name);
  const list =
    named.length === 2 ? `${named[0]} and ${named[1]}` : named[0];
  return `Approximately ${coveragePct}% of the area has vegetation, with gaps in the ${list}.`;
}

function heatSourcesFrom(hotspots: Hotspot[], aoi: LandCoverProfile | null): string[] {
  const sources = new Set<string>();
  const built = aoi?.builtDensityPct ?? averageFactor(hotspots, "building_density") ?? 0;
  const impervious = aoi?.imperviousPct ?? averageFactor(hotspots, "impervious_surface") ?? 0;
  const canopy = aoi?.treeCanopyPct ?? averageFactor(hotspots, "tree_canopy") ?? 40;

  if (built >= 35 || impervious >= 55) sources.add("concrete buildings");
  if (impervious >= 50) sources.add("asphalt roads");
  if (impervious >= 65) sources.add("parking lots");
  if (built >= 70 && canopy < 12) sources.add("industrial facilities");
  if (built >= 45) sources.add("metal roofs");
  if (sources.size === 0) {
    sources.add("paved surfaces");
    sources.add("building mass");
  }
  return [...sources];
}

function averageFactor(
  hotspots: Hotspot[],
  id: Hotspot["factors"][number]["id"],
): number | null {
  const values = hotspots
    .map((h) => factorValue(h, id))
    .filter((v): v is number => v !== null);
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function materialsFrom(built: number): string[] {
  if (built >= 60) return ["concrete", "glass", "metal"];
  if (built >= 30) return ["concrete", "asphalt"];
  return ["asphalt", "mixed"];
}

function densityWord(pct: number): BriefIntensity {
  if (pct >= 55) return "high";
  if (pct >= 30) return "medium";
  return "low";
}

function correlationLine(zone: BriefHotZone): string {
  if (zone.severity === "extreme" || zone.name === "central area") {
    return `Primary hotspot correlates with ${zone.cause} in the ${zone.name}.`;
  }
  return `${capitalize(zone.name)} hotspot is associated with ${zone.cause}.`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function infrastructureImpact(
  hotZones: BriefHotZone[],
  coolZones: CoolZone[],
  sources: string[],
): string {
  const hotNames = hotZones.slice(0, 2).map((z) => z.name);
  const hotList = hotNames.length ? hotNames.join(" and ") : "the analysed area";
  const sourceList = sources.slice(0, 3).join(", ");
  const coolBit = coolZones[0]
    ? ` ${capitalize(coolZones[0].name)} cools via ${coolZones[0].source}.`
    : "";
  return `${capitalize(hotList)} generate the most heat from ${sourceList}.${coolBit}`;
}

function coolingLabel(rec: Recommendation): string {
  const [lo, hi] = rec.expectedCoolingC;
  if (lo === 0 && hi === 0) return "people-focused";
  const a = Math.max(1, Math.round(lo));
  const b = Math.max(a, Math.round(hi));
  if (a === b) return `${a}°C reduction`;
  return `${a}–${b}°C reduction`;
}

function horizonFor(rec: Recommendation): AggregatedRecommendation["horizon"] {
  if (rec.costTier === "quick_win") return "Immediate Action";
  if (rec.costTier === "programmatic") return "Short-term Project";
  return "Long-term Strategy";
}

function costLabel(rec: Recommendation): AggregatedRecommendation["costLabel"] {
  if (rec.costTier === "quick_win") return "Low";
  if (rec.costTier === "programmatic") return "Medium";
  return "High";
}

function timelineFor(rec: Recommendation): string {
  if (rec.costTier === "quick_win") return "1–6 months";
  if (rec.costTier === "programmatic") return "1–2 years";
  return "2–4 years";
}

function costBandShort(rec: Recommendation): string {
  if (rec.costTier === "quick_win") return "Low: <$50K";
  if (rec.costTier === "programmatic") return "Medium: $50K–$250K";
  return "High: $250K+";
}

const DEFAULT_RECOMMENDATIONS: AggregatedRecommendation[] = [
  {
    id: "street-tree-canopy",
    title: "Plant street trees",
    horizon: "Short-term Project",
    coolingLabel: "1–3°C reduction",
    costBand: "Medium: $50K–$250K",
    costLabel: "Medium",
    timeline: "1–2 years",
    impactSummary: "1–3°C reduction expected.",
    impactTier: "high",
  },
  {
    id: "cool-pavement",
    title: "Implement reflective roofing and pavements",
    horizon: "Long-term Strategy",
    coolingLabel: "1–2°C reduction",
    costBand: "Medium: $50K–$250K",
    costLabel: "Medium",
    timeline: "2–4 years",
    impactSummary: "1–2°C reduction expected.",
    impactTier: "medium",
  },
  {
    id: "cool-roofs",
    title: "Develop green roofs",
    horizon: "Short-term Project",
    coolingLabel: "1–2°C reduction",
    costBand: "Medium: $50K–$250K",
    costLabel: "Medium",
    timeline: "1–2 years",
    impactSummary: "1–2°C reduction expected.",
    impactTier: "medium",
  },
  {
    id: "cool-corridor",
    title: "Designate a cool corridor",
    horizon: "Long-term Strategy",
    coolingLabel: "2–4°C reduction",
    costBand: "High: $250K+",
    costLabel: "High",
    timeline: "2–4 years",
    impactSummary: "2–4°C reduction expected.",
    impactTier: "high",
  },
  {
    id: "shade-structures",
    title: "Install temporary shade structures",
    horizon: "Immediate Action",
    coolingLabel: "1°C reduction",
    costBand: "Low: <$50K",
    costLabel: "Low",
    timeline: "1–6 months",
    impactSummary: "1°C reduction expected.",
    impactTier: "low",
  },
  {
    id: "depave-green-infrastructure",
    title: "Create pocket parks",
    horizon: "Long-term Strategy",
    coolingLabel: "1–3°C reduction",
    costBand: "Medium: $50K–$250K",
    costLabel: "Medium",
    timeline: "2–4 years",
    impactSummary: "1–3°C reduction expected.",
    impactTier: "medium",
  },
];

export function aggregateRecommendations(hotspots: Hotspot[]): AggregatedRecommendation[] {
  const byId = new Map<string, Recommendation>();
  for (const hotspot of hotspots) {
    for (const rec of hotspot.recommendations) {
      const existing = byId.get(rec.id);
      if (!existing || rec.priority > existing.priority) {
        byId.set(rec.id, rec);
      }
    }
  }

  const produced = [...byId.values()]
    .filter((rec) => rec.id !== "monitor")
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 6)
    .map((rec) => ({
      id: rec.id,
      title: SHORT_TITLES[rec.id] ?? rec.title,
      horizon: horizonFor(rec),
      coolingLabel: coolingLabel(rec),
      costBand: costBandShort(rec),
      costLabel: costLabel(rec),
      timeline: timelineFor(rec),
      impactSummary: `${coolingLabel(rec)} expected.`,
      impactTier: rec.impactTier,
    }));

  if (produced.length === 0) {
    return DEFAULT_RECOMMENDATIONS;
  }

  return produced;
}

function opportunitiesFrom(
  hotZones: BriefHotZone[],
  hotspots: Hotspot[],
): GreenOpportunity[] {
  const usedActions = new Set<string>();
  const cards: GreenOpportunity[] = [];

  for (const zone of hotZones) {
    const hotspot = hotspots.find((h) => h.id === zone.hotspotId);
    if (!hotspot) continue;
    for (const rec of hotspot.recommendations) {
      const action = OPPORTUNITY_ACTIONS[rec.id];
      if (!action || usedActions.has(action)) continue;
      usedActions.add(action);
      cards.push({
        name: zone.name,
        feasibility: rec.costTier === "quick_win" ? "high" : "medium",
        impact: rec.impactTier === "low" ? "medium" : rec.impactTier,
        action,
      });
      break;
    }
    if (cards.length >= 3) break;
  }

  return cards;
}

export function buildBrief(input: {
  origin: LatLng;
  hotspots: Hotspot[];
  coolZones: CoolZone[];
  aoiLandCover: LandCoverProfile | null;
  heatGapC: number;
  forecast?: ForecastInsight | null;
}): AnalysisBrief {
  const used = new Set<string>();
  const namedHotspots = input.hotspots.map((hotspot) => ({
    hotspot,
    name: claimZoneName(input.origin, hotspot.center, used),
  }));

  const hotZones: BriefHotZone[] = namedHotspots.map(({ hotspot, name }) => {
    const severity = severityFromHotspot(hotspot);
    return {
      id: `zone-${hotspot.id}`,
      hotspotId: hotspot.id,
      name,
      description: hotZoneDescription(hotspot, severity),
      cause: causeLabel(hotspot),
      severity,
    };
  });

  const coveragePct = Math.round(
    input.aoiLandCover?.treeCanopyPct ??
      input.aoiLandCover?.vegetatedSharePct ??
      averageFactor(input.hotspots, "tree_canopy") ??
      0,
  );
  const buildingPct = Math.round(
    input.aoiLandCover?.builtDensityPct ??
      input.aoiLandCover?.imperviousPct ??
      averageFactor(input.hotspots, "building_density") ??
      0,
  );

  const treeCoverage: VegetationPatch[] = input.coolZones
    .filter((z) => z.source === "park space" || z.source === "light vegetation")
    .slice(0, 3)
    .map((z) => ({
      name: z.name,
      density: z.source === "park space" ? "dense" : "sparse",
      area: z.intensity === "high" ? "large" : z.intensity === "medium" ? "medium" : "small",
    }));

  if (treeCoverage.length === 0 && coveragePct > 0) {
    treeCoverage.push({
      name: "area-wide",
      density: canopyDensity(coveragePct),
      area: coveragePct >= 25 ? "medium" : "small",
    });
  }

  const parks: VegetationPatch[] = input.coolZones
    .filter((z) => z.source === "park space" || z.source === "large water body")
    .slice(0, 3)
    .map((z) => ({
      name: z.name,
      size: z.intensity === "high" ? "medium" : "small",
      quality: z.source === "park space" ? "good" : "fair",
    }));

  const gaps: VegetationGap[] = hotZones
    .filter((z) => {
      const hotspot = input.hotspots.find((h) => h.id === z.hotspotId);
      const canopy = hotspot ? factorValue(hotspot, "tree_canopy") : null;
      return canopy === null || canopy < 18;
    })
    .slice(0, 3)
    .map((z) => ({
      name: z.name,
      development: developmentLabel(
        input.hotspots.find((h) => h.id === z.hotspotId) as Hotspot,
      ),
    }));

  const vegetation: VegetationInsights = {
    coveragePct,
    summary: vegetationSummary(coveragePct, gaps),
    treeCoverage,
    parks,
    gaps,
    opportunities: opportunitiesFrom(hotZones, input.hotspots),
  };

  const sources = heatSourcesFrom(input.hotspots, input.aoiLandCover);
  const severity = heatIslandSeverity(input.hotspots, input.heatGapC);

  const correlations = {
    heatSources: sources,
    buildingDensity: densityWord(buildingPct),
    materials: materialsFrom(buildingPct),
    correlations: hotZones.slice(0, 5).map(correlationLine),
    infrastructureImpact: infrastructureImpact(hotZones, input.coolZones, sources),
  };

  return {
    thermalOverview: {
      hotSpotCount: hotZones.length,
      coolSpotCount: input.coolZones.length,
      heatIslandSeverity: severity,
      summary: thermalSummary(hotZones.length, input.coolZones.length, severity),
      ...(input.forecast ? { forecast: input.forecast } : {}),
    },
    hotZones,
    coolZones: input.coolZones,
    vegetation,
    correlations,
    areaMetrics: {
      vegetationCoveragePct: coveragePct,
      buildingDensityPct: buildingPct,
    },
    recommendations: aggregateRecommendations(input.hotspots),
  };
}
