/**
 * Shared domain types.
 *
 * These are the contract between the analysis pipeline (server) and the
 * dashboard/report (client), so they are deliberately serialisable — no Dates,
 * no class instances, no functions.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface BoundingBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/**
 * Where a number came from and how much it should be trusted. Every panel in
 * the UI renders this, which is what keeps "never silently show stale or
 * fabricated data" enforceable rather than aspirational.
 */
export type ProvenanceStatus = "live" | "demo" | "cached" | "unavailable";

export interface Provenance {
  status: ProvenanceStatus;
  /** Human-readable source name, e.g. "FortyGuard Temperature API". */
  source: string;
  /** ISO timestamp of when the underlying value was retrieved. */
  fetchedAt: string;
  /** ISO timestamp the data itself describes, when different from fetchedAt. */
  observedAt?: string;
  /** Short explanation shown on hover — why it is demo/unavailable, vintage, etc. */
  note?: string;
  /** Link to the upstream dataset or documentation. */
  url?: string;
}

export type AnalysisMode = "historical" | "current" | "forecast";

export type AnalyticLayer = "tcm" | "exceedance" | "persistence" | "time_of_measure";

export interface AnalysisRequest {
  center: LatLng;
  /** Half-width of the square AOI in metres. */
  radiusMeters: number;
  mode: AnalysisMode;
  /** YYYY-MM-DD, required for historical mode. */
  date?: string;
  /** HH:MM 24-hour, required for historical mode. */
  time?: string;
  /** Hours ahead of now, only used in forecast mode (0–12). */
  forecastOffsetHours?: number;
  granularity?: number;
  /** Exceedance / persistence threshold in °C. */
  thresholdC?: number;
  /** Human-readable label for the place, from the geocoder or reverse lookup. */
  placeLabel?: string;
}

/** One heatmap cell as returned by FortyGuard, normalised. */
export interface HeatTile {
  /** Centroid of the tile. */
  center: LatLng;
  /** Tile footprint, closed ring, [lng, lat] pairs. */
  ring: [number, number][];
  /** Value in the layer's native unit (°C for tcm, hours otherwise). */
  value: number;
}

export interface TemperatureStats {
  min: number;
  max: number;
  mean: number;
  stdDev: number;
}

export interface HeatGrid {
  layer: AnalyticLayer;
  unit: "celsius" | "hours";
  tiles: HeatTile[];
  stats: TemperatureStats;
  /** Histogram of values across the AOI, for the distribution chart. */
  distribution: { bucket: number; count: number }[];
  provenance: Provenance;
  /** Set when the grid could not be produced at all. */
  error?: string;
}

export interface ContributingFactor {
  id: "tree_canopy" | "impervious_surface" | "building_density" | "vegetation_deficit";
  label: string;
  /** Raw measured value, e.g. 8 for 8% canopy. */
  value: number;
  unit: string;
  /**
   * How much this factor contributes to the observed heat anomaly, 0–1.
   * Derived from published urban-heat-island literature weightings; see
   * `src/lib/analysis/factors.ts` for the exact model.
   */
  contribution: number;
  contributionTier: "high" | "medium" | "low";
  /** One-sentence plain-English reading of the value. */
  interpretation: string;
  provenance: Provenance;
}

export interface VulnerabilityContext {
  /** 0–100; higher means more exposed population. */
  score: number;
  tier: "severe" | "elevated" | "moderate" | "low";
  tractName?: string;
  tractGeoid?: string;
  population?: number;
  populationDensityPerSqMi?: number;
  percentOver65?: number;
  percentBelowPoverty?: number;
  percentNoVehicle?: number;
  medianHouseholdIncome?: number;
  /** People inside the hotspot footprint, estimated from tract density. */
  estimatedPeopleInHotspot?: number;
  provenance: Provenance;
  components: { label: string; value: number; normalized: number }[];
}

export type CostTier = "quick_win" | "programmatic" | "capital_project";
export type ImpactTier = "high" | "medium" | "low";

export interface Recommendation {
  id: string;
  title: string;
  /** What to do, in the imperative. */
  action: string;
  /** Why this specific hotspot warrants it, grounded in the measured factors. */
  rationale: string;
  costTier: CostTier;
  impactTier: ImpactTier;
  /** Indicative capital cost band; deliberately a range, not a point estimate. */
  costBand: string;
  /** Expected peak-temperature reduction band in °C, from published studies. */
  expectedCoolingC: [number, number];
  timeframe: string;
  /** Which measured factors triggered this rule. */
  triggeredBy: string[];
  /** Literature backing the cooling estimate. */
  evidence: string;
  priority: number;
  /**
   * Optional deployment window from the 12-hour forecast, e.g. "before 2:00 PM".
   * Present only when the forecast shows a sustained extreme-heat stretch.
   */
  recommendedWindow?: string;
}

export interface Hotspot {
  id: string;
  rank: number;
  center: LatLng;
  bbox: BoundingBox;
  /** Footprint of the detected cluster, [lng, lat] rings. */
  polygon: [number, number][][];
  areaSqMeters: number;
  tileCount: number;
  /** Mean temperature across the cluster, °C. */
  meanTempC: number;
  peakTempC: number;
  /** Degrees above the AOI mean. */
  anomalyC: number;
  /** Standard deviations above the AOI mean. */
  zScore: number;
  /** Hours above threshold, from the exceedance layer. */
  exceedanceHours?: number;
  /** Longest continuous run above threshold, from the persistence layer. */
  persistenceHours?: number;
  /** 0–100 composite. */
  severityScore: number;
  severityTier: "critical" | "high" | "moderate" | "watch";
  severityBreakdown: { label: string; weight: number; normalized: number }[];
  factors: ContributingFactor[];
  vulnerability: VulnerabilityContext | null;
  recommendations: Recommendation[];
  /** Nearest street address, from the Census reverse geocoder. */
  addressLabel?: string;
}

export interface HourlySample {
  /** ISO timestamp. */
  timestamp: string;
  /** Local hour 0–23, for axis labels. */
  hourLocal: number;
  airTempC?: number;
  heatIndexC?: number;
  apparentTempC?: number;
  relativeHumidityPct?: number;
  isForecast: boolean;
}

export interface HourlyProfile {
  samples: HourlySample[];
  provenance: Provenance;
  timezone?: string;
  error?: string;
}

export interface ClimateTrendPoint {
  year: number;
  /** Mean daily maximum for the warm season, °C. */
  meanSummerMaxC: number;
  /** Days at or above the extreme-caution threshold. */
  daysAboveThreshold: number;
}

export interface ClimateTrend {
  points: ClimateTrendPoint[];
  thresholdC: number;
  /** Least-squares slope in °C/year across the window. */
  trendCPerYear: number;
  provenance: Provenance;
  error?: string;
}

export interface AoiSummary {
  meanTempC: number;
  peakTempC: number;
  minTempC: number;
  /** Share of the AOI above the exceedance threshold at the analysed time. */
  shareAboveThreshold: number;
  /** Spread between the coolest and hottest tile — the intra-urban heat gap. */
  heatGapC: number;
  areaSqMiles: number;
  tileCount: number;
  granularityMeters: number;
  thresholdC: number;
  /** AOI-level tree + vegetated cover, 0–100. */
  vegetationCoveragePct?: number;
  /** AOI-level medium/high-intensity development, 0–100. */
  buildingDensityPct?: number;
}

export type BriefSeverity = "extreme" | "high" | "medium";
export type BriefIntensity = "high" | "medium" | "low";
export type ActionHorizon = "Immediate Action" | "Short-term Project" | "Long-term Strategy";
export type CostLabel = "Low" | "Medium" | "High";

export interface CoolZone {
  id: string;
  name: string;
  center: LatLng;
  bbox: BoundingBox;
  polygon: [number, number][][];
  meanTempC: number;
  anomalyC: number;
  intensity: BriefIntensity;
  source: string;
  description: string;
}

export interface BriefHotZone {
  id: string;
  hotspotId: string;
  name: string;
  description: string;
  cause: string;
  severity: BriefSeverity;
}

export interface VegetationPatch {
  name: string;
  density?: string;
  area?: string;
  size?: string;
  quality?: string;
}

export interface VegetationGap {
  name: string;
  development: string;
}

export interface GreenOpportunity {
  name: string;
  feasibility: BriefIntensity;
  impact: BriefIntensity;
  action: string;
}

export interface VegetationInsights {
  coveragePct: number;
  summary: string;
  treeCoverage: VegetationPatch[];
  parks: VegetationPatch[];
  gaps: VegetationGap[];
  opportunities: GreenOpportunity[];
}

export interface UrbanCorrelations {
  heatSources: string[];
  buildingDensity: BriefIntensity;
  materials: string[];
  correlations: string[];
  infrastructureImpact: string;
}

export interface AreaMetrics {
  vegetationCoveragePct: number;
  buildingDensityPct: number;
}

export interface ForecastHourlyTemp {
  /** Clock label in the AOI's local zone, e.g. "2:00 PM". */
  hour: string;
  hourLocal: number;
  meanTemp: number;
  maxTemp: number;
}

export type ForecastTrend = "rising" | "falling" | "steady";

/**
 * Deterministic 12-hour forecast insight for the Thermal Overview card.
 * Omitted entirely when the forecast request fails, times out, or returns
 * too few hours — never filled with placeholder numbers.
 */
export interface ForecastInsight {
  hourlyMeanTemps: ForecastHourlyTemp[];
  /** Local clock time of the hour with the highest predicted max temp. */
  peakHour: string;
  peakTempC: number;
  /** Count of hours whose predicted max exceeds the NWS Extreme Caution threshold. */
  hoursAboveThreshold: number;
  trend: ForecastTrend;
  /** One-sentence reading, from a template — not an LLM. */
  sentence: string;
  thresholdC: number;
}

export interface ThermalOverview {
  hotSpotCount: number;
  coolSpotCount: number;
  heatIslandSeverity: "High" | "Medium" | "Low";
  summary: string;
  /** Present only when a 12-hour forecast was actually retrieved. */
  forecast?: ForecastInsight;
}

export interface AggregatedRecommendation {
  id: string;
  title: string;
  horizon: ActionHorizon;
  coolingLabel: string;
  costBand: string;
  costLabel: CostLabel;
  timeline: string;
  impactSummary: string;
  impactTier: ImpactTier;
  /** e.g. "before 2:00 PM" — only set for time-sensitive quick wins. */
  recommendedWindow?: string;
}

export interface AnalysisBrief {
  thermalOverview: ThermalOverview;
  hotZones: BriefHotZone[];
  coolZones: CoolZone[];
  vegetation: VegetationInsights;
  correlations: UrbanCorrelations;
  areaMetrics: AreaMetrics;
  recommendations: AggregatedRecommendation[];
}

export interface Insights {
  /** 2–3 sentence executive summary. */
  headline: string;
  narrative: string;
  /** Bulleted findings, each traceable to a measured value. */
  keyFindings: string[];
  generator: "llm" | "template";
  provenance: Provenance;
}

/**
 * The window that exceedance and persistence were measured over. Surfaced so
 * "12 hours above 32 °C" is never shown without saying which twelve hours.
 */
export interface ExposureWindow {
  /** Length of the window in hours. */
  hours: number;
  /** Human-readable local range, e.g. "10 AM–4 PM local". */
  localLabel: string;
}

export interface AnalysisResult {
  id: string;
  createdAt: string;
  request: AnalysisRequest;
  resolvedDateTime: {
    /** ISO timestamp being analysed. */
    timestamp: string;
    label: string;
    mode: AnalysisMode;
  };
  exposureWindow: ExposureWindow;
  /** Standard deviations above the area mean used to flag hotspot cells. */
  detectionThresholdZ: number;
  bbox: BoundingBox;
  placeLabel: string;
  summary: AoiSummary;
  grid: HeatGrid;
  exceedanceGrid?: HeatGrid;
  persistenceGrid?: HeatGrid;
  hotspots: Hotspot[];
  coolZones: CoolZone[];
  brief: AnalysisBrief;
  hourlyProfile: HourlyProfile;
  climateTrend: ClimateTrend;
  insights: Insights;
  /** Aggregated across all sources, for the "data quality" strip. */
  dataQuality: {
    provenance: Provenance[];
    /** 0–1 confidence in the composite result. */
    confidence: number;
    confidenceLabel: "high" | "moderate" | "indicative";
    caveats: string[];
  };
  /** Wall-clock time the pipeline took, milliseconds. */
  computeMs: number;
}

export interface GeocodeResult {
  label: string;
  center: LatLng;
  /** "address" | "place" | "coordinates" */
  kind: string;
  state?: string;
  county?: string;
}

export interface ApiError {
  error: string;
  detail?: string;
  /** Actionable next step for the user, not a stack trace. */
  hint?: string;
  code?: string;
}
