import type {
  ContributingFactor,
  Hotspot,
  Recommendation,
  VulnerabilityContext,
} from "@/lib/types";

/**
 * Cooling recommendation engine.
 *
 * Rule-based and deterministic on purpose. A city has to defend a capital
 * request, so every recommendation has to be traceable to the specific measured
 * values that triggered it — which is also why each rule records `triggeredBy`.
 *
 * The expected cooling ranges are near-surface *air* temperature reductions
 * reported in urban-heat-island field studies and modelling, not surface
 * temperature reductions, which are far larger and routinely misquoted. They are
 * ranges rather than point estimates because the realised effect depends on
 * local geometry, irrigation and prevailing wind.
 *
 * The optional LLM layer in `generateInsights.ts` may reorder and rephrase these
 * for a report, but it never creates them and never touches their numbers.
 */

interface RuleContext {
  canopyPct: number | null;
  imperviousPct: number | null;
  builtDensityPct: number | null;
  waterSharePct: number | null;
  vegetatedSharePct: number | null;
  anomalyC: number;
  peakTempC: number;
  exceedanceHours?: number;
  persistenceHours?: number;
  areaSqMeters: number;
  vulnerability: VulnerabilityContext | null;
  severityScore: number;
}

type Rule = (ctx: RuleContext) => Recommendation | null;

function hectares(sqMeters: number): number {
  return sqMeters / 10_000;
}

/** Order used to break ties: cheaper interventions win at equal impact. */
const COST_ORDER: Record<Recommendation["costTier"], number> = {
  quick_win: 0,
  programmatic: 1,
  capital_project: 2,
};

const IMPACT_ORDER: Record<Recommendation["impactTier"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const RULES: Rule[] = [
  (ctx) => {
    if (ctx.canopyPct === null || ctx.canopyPct >= 15) return null;
    const severe = ctx.canopyPct < 8;
    const treesNeeded = Math.max(20, Math.round(hectares(ctx.areaSqMeters) * 55));
    return {
      id: "street-tree-canopy",
      title: severe ? "Priority street tree planting" : "Street tree infill planting",
      action: `Plant approximately ${treesNeeded.toLocaleString()} large-canopy street trees across this footprint, prioritising the south and west sides of streets and any pedestrian route to transit.`,
      rationale: `Canopy cover here is ${ctx.canopyPct.toFixed(1)}%, against a 40% urban target. Shade is the single largest missing cooling mechanism in this hotspot.`,
      costTier: "programmatic",
      impactTier: "high",
      costBand: `$${(treesNeeded * 0.4).toFixed(0)}k–$${(treesNeeded * 1.2).toFixed(0)}k capital, plus 3-year establishment watering`,
      expectedCoolingC: [0.8, 2.5],
      timeframe: "Planting in one season; full canopy benefit in 8–15 years",
      triggeredBy: [`Tree canopy ${ctx.canopyPct.toFixed(1)}%`],
      evidence:
        "Meta-analyses of urban greening find tree-shaded streets run 0.8–2.5 °C cooler in air temperature than unshaded equivalents, with far larger reductions in surface and radiant temperature.",
      priority: severe ? 98 : 84,
    };
  },

  (ctx) => {
    if (ctx.canopyPct === null || ctx.canopyPct >= 12) return null;
    return {
      id: "shade-structures",
      title: "Engineered shade at pedestrian pinch points",
      action:
        "Install shade sails or canopied shelters at bus stops, crossings and any playground or plaza inside the hotspot, as an immediate bridge until tree canopy matures.",
      rationale:
        "Trees take a decade to deliver meaningful shade. Built shade closes that gap for the people exposed today.",
      costTier: "quick_win",
      impactTier: "medium",
      costBand: "$15k–$60k per structure",
      expectedCoolingC: [0.3, 1.0],
      timeframe: "3–6 months",
      triggeredBy: [`Tree canopy ${ctx.canopyPct.toFixed(1)}%`],
      evidence:
        "Shade structures cut mean radiant temperature by 15–30 °C at the point of use; the effect on measured air temperature is smaller but the reduction in heat strain is immediate.",
      priority: 72,
    };
  },

  (ctx) => {
    if (ctx.peakTempC < 36) return null;
    if (ctx.canopyPct !== null && ctx.canopyPct >= 20) return null;
    return {
      id: "misting-systems",
      title: "Deploy misting systems",
      action:
        "Place portable misting stations at the hottest pedestrian pinch points during peak-heat hours.",
      rationale: `Peak air temperature reaches ${ctx.peakTempC.toFixed(1)} °C with little shade, so evaporative cooling is the fastest on-street relief.`,
      costTier: "quick_win",
      impactTier: "medium",
      costBand: "$8k–$40k per season",
      expectedCoolingC: [1.0, 2.0],
      timeframe: "Days to weeks",
      triggeredBy: [`Peak ${ctx.peakTempC.toFixed(1)} °C`],
      evidence:
        "Misting and evaporative cooling stations reduce perceived heat immediately at the point of use; they do not change neighbourhood-scale air temperature.",
      priority: 78,
    };
  },

  (ctx) => {
    if (ctx.imperviousPct === null || ctx.imperviousPct < 65) return null;
    const severe = ctx.imperviousPct >= 85;
    return {
      id: "cool-pavement",
      title: severe ? "Reflective pavement treatment" : "Cool and permeable paving programme",
      action: `Resurface roadway and surface parking with high-albedo or permeable treatments across roughly ${hectares(
        ctx.areaSqMeters,
      ).toFixed(1)} hectares, scheduling it into the existing repaving cycle to avoid standalone capital cost.`,
      rationale: `${ctx.imperviousPct.toFixed(1)}% of this footprint is sealed surface, storing solar gain through the day and releasing it into the evening.`,
      costTier: severe ? "capital_project" : "programmatic",
      impactTier: severe ? "high" : "medium",
      costBand: `$${(hectares(ctx.areaSqMeters) * 40).toFixed(0)}k–$${(hectares(ctx.areaSqMeters) * 120).toFixed(0)}k, materially lower if bundled into scheduled repaving`,
      expectedCoolingC: [0.4, 1.7],
      timeframe: "1–3 years, aligned to the resurfacing schedule",
      triggeredBy: [`Impervious surface ${ctx.imperviousPct.toFixed(1)}%`],
      evidence:
        "Field trials of reflective pavement coatings report 0.4–1.7 °C reductions in near-surface air temperature over treated blocks, with the largest effect during afternoon peak.",
      priority: severe ? 88 : 68,
    };
  },

  (ctx) => {
    if (ctx.builtDensityPct === null || ctx.builtDensityPct < 45) return null;
    const nightRetention = (ctx.persistenceHours ?? 0) >= 6;
    return {
      id: "cool-roofs",
      title: "Cool roof retrofit",
      action:
        "Require or incentivise high-albedo roofing at the next re-roofing cycle for buildings inside the hotspot, starting with large flat commercial and municipal roofs.",
      rationale: nightRetention
        ? `Dense development covers ${ctx.builtDensityPct.toFixed(0)}% of this footprint and heat persists late into the day, which points to thermal mass and roof absorption rather than daytime shading alone.`
        : `Dense development covers ${ctx.builtDensityPct.toFixed(0)}% of this footprint, so roof surfaces are the largest available cooling area — there is limited ground-level room to plant.`,
      costTier: "programmatic",
      impactTier: nightRetention ? "high" : "medium",
      costBand: "$5–$20 per m² incremental over standard roofing",
      expectedCoolingC: [0.3, 1.5],
      timeframe: "Rolling, tied to roof replacement cycles",
      triggeredBy: [
        `Built density ${ctx.builtDensityPct.toFixed(0)}%`,
        ...(nightRetention ? [`Heat persists ${ctx.persistenceHours ?? "late"} hours above threshold`] : []),
      ],
      evidence:
        "City-scale modelling of widespread cool-roof adoption shows 0.3–1.5 °C reductions in neighbourhood air temperature, concentrated in the late afternoon and evening.",
      priority: nightRetention ? 86 : 66,
    };
  },

  (ctx) => {
    if (ctx.imperviousPct === null || ctx.imperviousPct < 70) return null;
    if (ctx.vegetatedSharePct !== null && ctx.vegetatedSharePct > 25) return null;
    if (hectares(ctx.areaSqMeters) < 0.8) return null;
    return {
      id: "depave-green-infrastructure",
      title: "Depave and convert to green infrastructure",
      action:
        "Identify underused surface parking and oversized roadway within the hotspot and convert to bioswales, rain gardens or pocket parks.",
      rationale:
        "Removing sealed surface addresses the cause rather than the symptom, and adds stormwater capacity that can usually be funded from a separate budget line.",
      costTier: "capital_project",
      impactTier: "high",
      costBand: "$150k–$900k per converted parcel",
      expectedCoolingC: [1.0, 3.0],
      timeframe: "2–4 years including design and community consultation",
      triggeredBy: [
        `Impervious surface ${ctx.imperviousPct.toFixed(1)}%`,
        ...(ctx.vegetatedSharePct !== null ? [`Vegetated cover ${ctx.vegetatedSharePct.toFixed(0)}%`] : []),
      ],
      evidence:
        "Converted green space measures 1–3 °C cooler than the paved surface it replaced, with the cooling extending roughly one block beyond the site boundary.",
      priority: 70,
    };
  },

  (ctx) => {
    const v = ctx.vulnerability;
    if (!v || v.score < 55) return null;
    const elderly = v.percentOver65 ?? 0;
    const carless = v.percentNoVehicle ?? 0;
    const walkable = carless >= 30;
    return {
      id: "cooling-centre",
      title: walkable ? "Walk-in cooling centre within 400 m" : "Designated cooling centre",
      action: walkable
        ? "Designate and staff a cooling centre inside the hotspot, sited so every resident is within a 400 m walk, and shade the approach route."
        : "Designate a cooling centre serving this hotspot and publish it in the municipal heat-response plan.",
      rationale: `Heat vulnerability here scores ${v.score}/100${
        elderly ? `, with ${elderly.toFixed(1)}% of residents aged 65 or over` : ""
      }${walkable ? ` and ${carless.toFixed(0)}% of households without a vehicle` : ""}. This is the population that heat kills.`,
      costTier: "quick_win",
      impactTier: "high",
      costBand: "$20k–$80k per season in staffing and extended hours",
      expectedCoolingC: [0, 0],
      timeframe: "Deployable before the next heat season",
      triggeredBy: [
        `Vulnerability score ${v.score}/100`,
        ...(elderly ? [`${elderly.toFixed(1)}% aged 65+`] : []),
        ...(walkable ? [`${carless.toFixed(0)}% of households without a vehicle`] : []),
      ],
      evidence:
        "Cooling centres do not lower outdoor temperature; they reduce heat-related emergency presentations among people who cannot cool their homes. Uptake is strongly dependent on walking distance.",
      priority: v.score >= 70 ? 96 : 80,
    };
  },

  (ctx) => {
    const v = ctx.vulnerability;
    if (!v || (v.percentOver65 ?? 0) < 18) return null;
    return {
      id: "elderly-outreach",
      title: "Targeted check-in programme for older residents",
      action:
        "Run an active heat-season check-in on residents aged 65+ inside this hotspot, coordinated through the local health department and community organisations.",
      rationale: `${(v.percentOver65 ?? 0).toFixed(1)}% of residents in ${
        v.tractName ?? "this tract"
      } are 65 or over, well above the national tract average.`,
      costTier: "quick_win",
      impactTier: "high",
      costBand: "$10k–$40k per heat season",
      expectedCoolingC: [0, 0],
      timeframe: "Deployable in weeks",
      triggeredBy: [`${(v.percentOver65 ?? 0).toFixed(1)}% aged 65+`],
      evidence:
        "Heat mortality concentrates overwhelmingly in adults over 65, particularly those living alone. Active outreach is consistently the highest-yield low-cost measure in municipal heat plans.",
      priority: 90,
    };
  },

  (ctx) => {
    if ((ctx.exceedanceHours ?? 0) < 8) return null;
    return {
      id: "transit-shade",
      title: "Shade and hydration along transit and walking routes",
      action:
        "Shade every bus stop inside the hotspot and add drinking fountains along the main pedestrian desire lines.",
      rationale: `This area sits above the heat-risk threshold for ${ctx.exceedanceHours} hours of the day. Sustained exposure, not the daily peak, is what drives heat illness.`,
      costTier: "quick_win",
      impactTier: "medium",
      costBand: "$8k–$25k per stop",
      expectedCoolingC: [0.2, 0.8],
      timeframe: "One season",
      triggeredBy: [`${ctx.exceedanceHours} hours above the heat-risk threshold`],
      evidence:
        "Waiting in full sun at an unshaded stop is the single most common acute heat exposure in transit-dependent populations.",
      priority: 76,
    };
  },

  (ctx) => {
    const canopyOk = ctx.canopyPct !== null && ctx.canopyPct >= 25;
    const surfaceOk = ctx.imperviousPct !== null && ctx.imperviousPct < 55;
    if (!canopyOk || !surfaceOk) return null;
    if (ctx.anomalyC < 1.2) return null;
    return {
      id: "site-heat-audit",
      title: "On-site heat source audit",
      action:
        "Commission a site walk-through to identify anthropogenic heat sources — condenser banks, industrial process heat, large uninsulated roofs or vehicle idling areas.",
      rationale: `This hotspot runs ${ctx.anomalyC.toFixed(
        1,
      )} °C above the surrounding baseline despite adequate canopy and moderate impervious cover, so surface characteristics do not explain it.`,
      costTier: "quick_win",
      impactTier: "medium",
      costBand: "$5k–$20k for a consultant survey",
      expectedCoolingC: [0, 0],
      timeframe: "4–8 weeks",
      triggeredBy: [
        `Anomaly +${ctx.anomalyC.toFixed(1)} °C`,
        ...(ctx.canopyPct !== null ? [`Canopy ${ctx.canopyPct.toFixed(0)}% (adequate)`] : []),
      ],
      evidence:
        "Where surface cover does not explain a persistent thermal anomaly, waste heat from mechanical plant or industrial activity is the usual cause and is often cheap to mitigate once located.",
      priority: 64,
    };
  },

  (ctx) => {
    if (ctx.severityScore < 65) return null;
    if (hectares(ctx.areaSqMeters) < 1.5) return null;
    return {
      id: "cool-corridor",
      title: "Designate a cool corridor",
      action:
        "Combine tree planting, shade structures and reflective surfacing along one continuous route connecting this hotspot to the nearest transit stop, school or health facility.",
      rationale:
        "Concentrating several measures along a single route produces a usable cool path sooner than spreading the same budget thinly across the whole area.",
      costTier: "capital_project",
      impactTier: "high",
      costBand: "$400k–$1.5M per kilometre",
      expectedCoolingC: [1.5, 3.5],
      timeframe: "2–3 years",
      triggeredBy: [`Severity ${ctx.severityScore}/100`],
      evidence:
        "Cool-corridor projects in Phoenix, Los Angeles and Barcelona report 1.5–3.5 °C reductions along treated routes and measurable increases in walking during heat events.",
      priority: 74,
    };
  },
];

export function buildRecommendations(
  hotspot: Pick<
    Hotspot,
    "anomalyC" | "peakTempC" | "exceedanceHours" | "persistenceHours" | "areaSqMeters" | "severityScore"
  >,
  factors: ContributingFactor[],
  vulnerability: VulnerabilityContext | null,
  landCover: {
    waterSharePct: number | null;
    vegetatedSharePct: number | null;
  },
): Recommendation[] {
  const byId = (id: ContributingFactor["id"]) =>
    factors.find((f) => f.id === id)?.value ?? null;

  const ctx: RuleContext = {
    canopyPct: byId("tree_canopy"),
    imperviousPct: byId("impervious_surface"),
    builtDensityPct: byId("building_density"),
    waterSharePct: landCover.waterSharePct,
    vegetatedSharePct: landCover.vegetatedSharePct,
    anomalyC: hotspot.anomalyC,
    peakTempC: hotspot.peakTempC,
    exceedanceHours: hotspot.exceedanceHours,
    persistenceHours: hotspot.persistenceHours,
    areaSqMeters: hotspot.areaSqMeters,
    vulnerability,
    severityScore: hotspot.severityScore,
  };

  const produced = RULES.map((rule) => rule(ctx)).filter(
    (r): r is Recommendation => r !== null,
  );

  if (!produced.length) {
    return [
      {
        id: "monitor",
        title: "Monitor, no intervention warranted yet",
        action:
          "Keep this area on the watch list and re-run the analysis during the next heat event.",
        rationale:
          "Surface cover, exposure duration and population vulnerability are all within normal ranges for this area, so none of the intervention rules were triggered.",
        costTier: "quick_win",
        impactTier: "low",
        costBand: "No cost",
        expectedCoolingC: [0, 0],
        timeframe: "Ongoing",
        triggeredBy: ["No rule thresholds exceeded"],
        evidence:
          "Recommending nothing is a legitimate output. Spending capital where the evidence does not support it undermines the programme.",
        priority: 10,
      },
    ];
  }

  return produced.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (IMPACT_ORDER[a.impactTier] !== IMPACT_ORDER[b.impactTier]) {
      return IMPACT_ORDER[a.impactTier] - IMPACT_ORDER[b.impactTier];
    }
    return COST_ORDER[a.costTier] - COST_ORDER[b.costTier];
  });
}

export const COST_TIER_LABELS: Record<Recommendation["costTier"], string> = {
  quick_win: "Quick win",
  programmatic: "Programmatic",
  capital_project: "Capital project",
};

export const IMPACT_TIER_LABELS: Record<Recommendation["impactTier"], string> = {
  high: "High impact",
  medium: "Medium impact",
  low: "Low impact",
};
