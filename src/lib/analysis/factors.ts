import type { ContributingFactor, Provenance } from "@/lib/types";
import type { LandCoverProfile } from "@/lib/datasources/landcover";

/**
 * Contributing-factor attribution: the "why" behind a hotspot.
 *
 * Each factor gets a contribution share rather than a raw value, because a
 * planner's next question after "where" is always "which lever do I pull". The
 * shares come from a simple, inspectable linear model — deliberately not a
 * black box, and deliberately not an LLM.
 *
 * The weights reflect the relative influence these surface characteristics have
 * on daytime near-surface urban heat in the urban-heat-island literature:
 * missing canopy and impervious cover dominate, building mass contributes
 * through reduced sky view and waste heat but is secondary at the block scale.
 *
 * Each factor is scored as a *deficit* against a reference value, so a hotspot
 * with 40% canopy correctly attributes little of its heat to tree cover.
 */

interface FactorModel {
  id: ContributingFactor["id"];
  label: string;
  unit: string;
  weight: number;
  /** Maps a measured value onto a 0–1 deficit, where 1 is worst case. */
  deficit: (value: number) => number;
  interpret: (value: number, deficit: number) => string;
}

/**
 * American Forests treats 40% canopy as a healthy urban target and the US urban
 * average sits near 27%, so canopy deficit is scaled against a 40% reference.
 */
const CANOPY_TARGET_PCT = 40;

const MODELS: FactorModel[] = [
  {
    id: "tree_canopy",
    label: "Tree canopy cover",
    unit: "%",
    weight: 0.4,
    deficit: (value) => clamp01((CANOPY_TARGET_PCT - value) / CANOPY_TARGET_PCT),
    interpret: (value) => {
      if (value < 5) return `Effectively no tree cover (${fmt(value)}%). Surfaces receive full midday sun with no shade or transpirational cooling.`;
      if (value < 15) return `Sparse canopy at ${fmt(value)}%, well below the 40% urban target and below the US urban average of about 27%.`;
      if (value < 30) return `Moderate canopy at ${fmt(value)}%, still short of the 40% target used in urban forestry planning.`;
      return `Healthy canopy at ${fmt(value)}%, at or near the 40% urban target — trees are not the limiting factor here.`;
    },
  },
  {
    id: "impervious_surface",
    label: "Impervious surface",
    unit: "%",
    weight: 0.35,
    deficit: (value) => clamp01(value / 100),
    interpret: (value) => {
      if (value >= 85) return `Almost entirely sealed (${fmt(value)}% impervious). Asphalt and roofing store solar gain through the day and re-radiate it after sunset.`;
      if (value >= 60) return `Predominantly paved and built (${fmt(value)}% impervious), leaving little surface available for evaporative cooling.`;
      if (value >= 35) return `Mixed surface cover at ${fmt(value)}% impervious.`;
      return `Largely permeable at ${fmt(value)}% impervious — paving is not a major driver here.`;
    },
  },
  {
    id: "building_density",
    label: "Built density",
    unit: "% high-intensity",
    weight: 0.25,
    deficit: (value) => clamp01(value / 100),
    interpret: (value) => {
      if (value >= 70) return `Dense medium-to-high-intensity development across ${fmt(value)}% of the footprint. Narrow sky view slows night-time heat loss.`;
      if (value >= 35) return `Moderately dense development across ${fmt(value)}% of the footprint.`;
      if (value > 0) return `Low-intensity development across ${fmt(value)}% of the footprint.`;
      return "No high-intensity development detected in the sampled footprint.";
    },
  },
];

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function tierFor(contribution: number): ContributingFactor["contributionTier"] {
  if (contribution >= 0.4) return "high";
  if (contribution >= 0.2) return "medium";
  return "low";
}

export function buildContributingFactors(
  profile: LandCoverProfile,
): ContributingFactor[] {
  const measurements: Record<ContributingFactor["id"], number | null> = {
    tree_canopy: profile.treeCanopyPct,
    impervious_surface: profile.imperviousPct,
    building_density: profile.builtDensityPct,
    vegetation_deficit: null,
  };

  const available = MODELS.filter((model) => measurements[model.id] !== null);
  if (!available.length) return [];

  const scored = available.map((model) => {
    const value = measurements[model.id] as number;
    return { model, value, weighted: model.weight * model.deficit(value) };
  });

  const total = scored.reduce((acc, s) => acc + s.weighted, 0);

  return scored
    .map(({ model, value, weighted }) => {
      const contribution = total > 0 ? weighted / total : 1 / scored.length;
      return {
        id: model.id,
        label: model.label,
        value: Math.round(value * 10) / 10,
        unit: model.unit,
        contribution: Math.round(contribution * 1000) / 1000,
        contributionTier: tierFor(contribution),
        interpretation: model.interpret(value, model.deficit(value)),
        provenance: profile.provenance satisfies Provenance,
      } satisfies ContributingFactor;
    })
    .sort((a, b) => b.contribution - a.contribution);
}

/** Short sentence describing the dominant cause, used in report headlines. */
export function describeDominantFactor(factors: ContributingFactor[]): string | null {
  const top = factors[0];
  if (!top) return null;
  if (top.contributionTier === "low") {
    return "No single surface characteristic dominates — heat here is likely driven by waste heat or activity rather than surface cover alone.";
  }
  return `${top.label} at ${fmt(top.value)}${top.unit === "%" ? "%" : ` ${top.unit}`} accounts for roughly ${Math.round(
    top.contribution * 100,
  )}% of the modelled surface contribution.`;
}
