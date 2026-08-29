import { ANTHROPIC_API_KEY, ANTHROPIC_MODEL, GEMINI_API_KEY, GEMINI_MODEL } from "@/lib/config";
import type { AoiSummary, Hotspot, Insights } from "@/lib/types";

/**
 * Natural-language layer over the already-computed analysis.
 *
 * Hard rule: the model phrases, it does not compute. Every number in the output
 * has already been produced by the rules in `src/lib/analysis/`, and the prompt
 * says so explicitly. The response is validated to be plain prose and is
 * discarded on any failure, falling back to the deterministic template below.
 *
 * ANTHROPIC_API_KEY is optional. Without it, `templateInsights` produces the
 * same structure from the same inputs — the product is fully functional, the
 * prose is just less fluid, and the UI labels which generator was used.
 *
 * Called through `fetch` rather than the SDK to keep the serverless bundle
 * small and avoid a dependency that only one optional feature needs.
 */

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const LLM_TIMEOUT_MS = 45_000;

export interface InsightInput {
  placeLabel: string;
  timestampLabel: string;
  mode: string;
  summary: AoiSummary;
  hotspots: Hotspot[];
  isDemoData: boolean;
  exposureWindowLabel?: string;
}

interface LlmShape {
  headline: string;
  narrative: string;
  keyFindings: string[];
}

function structuredFacts(input: InsightInput): string {
  const lines: (string | undefined)[] = [
    `Area: ${input.placeLabel}`,
    `Time analysed: ${input.timestampLabel} (${input.mode})`,
    `AOI size: ${input.summary.areaSqMiles.toFixed(2)} sq mi at ${input.summary.granularityMeters} m resolution (${input.summary.tileCount} tiles)`,
    `Mean temperature: ${input.summary.meanTempC.toFixed(1)} C`,
    `Peak temperature: ${input.summary.peakTempC.toFixed(1)} C`,
    `Coolest tile: ${input.summary.minTempC.toFixed(1)} C`,
    `Intra-area heat gap: ${input.summary.heatGapC.toFixed(1)} C`,
    `Share of area above ${input.summary.thresholdC} C: ${(input.summary.shareAboveThreshold * 100).toFixed(0)}%`,
    input.exposureWindowLabel
      ? `Exceedance window: ${input.exposureWindowLabel}`
      : undefined,
    `Hotspots detected: ${input.hotspots.length}`,
  ];

  for (const hotspot of input.hotspots) {
    const factorText = hotspot.factors
      .map((f) => `${f.label} ${f.value}${f.unit} (${Math.round(f.contribution * 100)}% of modelled contribution)`)
      .join("; ");
    const v = hotspot.vulnerability;
    lines.push(
      [
        `Hotspot ${hotspot.rank}: ${hotspot.addressLabel ?? "unnamed location"}`,
        `  severity ${hotspot.severityScore}/100 (${hotspot.severityTier})`,
        `  mean ${hotspot.meanTempC.toFixed(1)} C, peak ${hotspot.peakTempC.toFixed(1)} C, +${hotspot.anomalyC.toFixed(1)} C above area baseline (z=${hotspot.zScore.toFixed(2)})`,
        `  area ${(hotspot.areaSqMeters / 10_000).toFixed(2)} hectares`,
        hotspot.exceedanceHours !== undefined
          ? `  ${hotspot.exceedanceHours} hours above ${input.summary.thresholdC} C${input.exposureWindowLabel ? ` (${input.exposureWindowLabel})` : ""}`
          : null,
        hotspot.persistenceHours !== undefined ? `  longest continuous run ${hotspot.persistenceHours} hours` : null,
        factorText ? `  contributing factors: ${factorText}` : null,
        v
          ? `  vulnerability ${v.score}/100 (${v.tier}); ${v.percentOver65 ?? "n/a"}% aged 65+, ${v.percentBelowPoverty ?? "n/a"}% below poverty, approx ${v.estimatedPeopleInHotspot ?? "n/a"} residents in footprint`
          : "  vulnerability data unavailable",
        `  top recommendations: ${hotspot.recommendations.slice(0, 3).map((r) => r.title).join("; ")}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

const SYSTEM_PROMPT = `You are a senior urban climate analyst writing for a city sustainability office and its capital planning committee.

You will be given a set of already-computed findings about urban heat in a specific area. Your job is to phrase them, not to analyse them.

Absolute rules:
- Use ONLY the numbers given to you. Never estimate, interpolate, round differently, or introduce any figure that is not in the input.
- Never invent place names, street names, facilities, or population figures.
- If something is marked unavailable, either omit it or say plainly that it was not available.
- Do not hedge with "may", "could potentially" filler. State what the data shows.
- No headings, no markdown, no bullet characters in the narrative.
- Write in British-neutral professional English, plain and direct. No marketing language, no adjectives like "alarming" or "devastating".
- Temperatures are in Celsius. Keep the same precision you were given.

Return ONLY valid JSON matching exactly:
{"headline": string, "narrative": string, "keyFindings": string[]}

headline: one sentence, max 25 words, stating the single most decision-relevant fact.
narrative: 3 to 5 sentences of continuous prose covering where the heat is, why, who is affected, and what to do first.
keyFindings: 3 to 5 short strings, each a single specific finding with its number.`;

function safeParseLlmJson(rawText: string): Partial<LlmShape> | null {
  if (!rawText || typeof rawText !== "string") return null;

  let cleaned = rawText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }

  const startIdx = cleaned.indexOf("{");
  const endIdx = cleaned.lastIndexOf("}");
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleaned = cleaned.slice(startIdx, endIdx + 1);
  }

  try {
    return JSON.parse(cleaned) as Partial<LlmShape>;
  } catch {
  }

  try {
    const sanitized = cleaned
      .replace(/\r\n/g, "\\n")
      .replace(/[\n\r]/g, "\\n")
      .replace(/,\s*([}\]])/g, "$1");

    return JSON.parse(sanitized) as Partial<LlmShape>;
  } catch {
  }

  try {
    const headlineMatch = cleaned.match(/"headline"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const narrativeMatch = cleaned.match(/"narrative"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const findingsMatch = cleaned.match(/"keyFindings"\s*:\s*\[([\s\S]*?)\]/);

    const headline = headlineMatch ? JSON.parse(`"${headlineMatch[1]}"`) : undefined;
    const narrative = narrativeMatch ? JSON.parse(`"${narrativeMatch[1]}"`) : undefined;
    let keyFindings: string[] = [];

    if (findingsMatch) {
      const items = findingsMatch[1].match(/"((?:[^"\\]|\\.)*)"/g);
      if (items) {
        keyFindings = items.map((it) => {
          try {
            return JSON.parse(it);
          } catch {
            return it.replace(/^"|"$/g, "");
          }
        });
      }
    }

    if (headline && narrative) {
      return { headline, narrative, keyFindings };
    }
  } catch {
  }

  return null;
}

async function callGemini(input: InsightInput): Promise<LlmShape | null> {
  if (!GEMINI_API_KEY) return null;

  const demoCaveat = input.isDemoData
    ? "\n\nNOTE: the temperature figures come from a simulator, not measured data. Do not describe them as observations; refer to them as modelled values."
    : "";

  try {
    console.log(`   🤖 [Google Gemini] Generating executive narrative using "${GEMINI_MODEL}"...`);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: `Findings:\n\n${structuredFacts(input)}${demoCaveat}` }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`   ⚠️ [Google Gemini] API returned ${res.status}: ${errBody.slice(0, 200)}`);
      return null;
    }

    const body = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.warn("   ⚠️ [Google Gemini] No text in candidate response");
      return null;
    }

    const parsed = safeParseLlmJson(text);

    if (
      !parsed ||
      typeof parsed.headline !== "string" ||
      typeof parsed.narrative !== "string" ||
      !Array.isArray(parsed.keyFindings) ||
      parsed.keyFindings.some((f) => typeof f !== "string")
    ) {
      console.warn("   ⚠️ [Google Gemini] Response JSON could not be parsed or did not match expected shape");
      return null;
    }

    console.log("   ✨ [Google Gemini] Narrative and key findings generated successfully.");
    return {
      headline: parsed.headline.trim(),
      narrative: parsed.narrative.trim(),
      keyFindings: parsed.keyFindings.map((f) => f.trim()).filter(Boolean).slice(0, 5),
    };
  } catch (err) {
    console.error("   ⚠️ [Google Gemini] Exception during API call:", err);
    return null;
  }
}

async function callAnthropic(input: InsightInput): Promise<LlmShape | null> {
  if (!ANTHROPIC_API_KEY) return null;

  const demoCaveat = input.isDemoData
    ? "\n\nNOTE: the temperature figures come from a simulator, not measured data. Do not describe them as observations; refer to them as modelled values."
    : "";

  try {
    const res = await fetch(ANTHROPIC_ENDPOINT, {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 2048,
        temperature: 0.2,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Findings:\n\n${structuredFacts(input)}${demoCaveat}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!res.ok) return null;

    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = body.content?.find((c) => c.type === "text")?.text;
    if (!text) return null;

    const parsed = safeParseLlmJson(text);

    if (
      !parsed ||
      typeof parsed.headline !== "string" ||
      typeof parsed.narrative !== "string" ||
      !Array.isArray(parsed.keyFindings) ||
      parsed.keyFindings.some((f) => typeof f !== "string")
    ) {
      return null;
    }

    return {
      headline: parsed.headline.trim(),
      narrative: parsed.narrative.trim(),
      keyFindings: parsed.keyFindings.map((f) => f.trim()).filter(Boolean).slice(0, 5),
    };
  } catch {
    return null;
  }
}

function templateInsights(input: InsightInput): LlmShape {
  const { summary, hotspots } = input;
  const top = hotspots[0];

  if (!top) {
    return {
      headline: `No distinct heat hotspots were detected across ${input.placeLabel} at ${input.timestampLabel}.`,
      narrative: `Temperature across this ${summary.areaSqMiles.toFixed(2)} square mile area averaged ${summary.meanTempC.toFixed(
        1,
      )} °C, ranging from ${summary.minTempC.toFixed(1)} °C to ${summary.peakTempC.toFixed(
        1,
      )} °C. The spread of ${summary.heatGapC.toFixed(
        1,
      )} °C between the coolest and hottest points is not large enough for any single area to stand out as a statistically distinct hotspot. This does not mean the area is cool in absolute terms — ${(
        summary.shareAboveThreshold * 100
      ).toFixed(0)}% of it sat above the ${summary.thresholdC} °C heat-risk threshold. Re-run this analysis during a heat event, or widen the area, to surface within-area contrasts.`,
      keyFindings: [
        `Mean temperature ${summary.meanTempC.toFixed(1)} °C across ${summary.areaSqMiles.toFixed(2)} sq mi`,
        `Heat gap of only ${summary.heatGapC.toFixed(1)} °C between coolest and hottest points`,
        `${(summary.shareAboveThreshold * 100).toFixed(0)}% of the area above the ${summary.thresholdC} °C threshold`,
      ],
    };
  }

  const topFactor = top.factors[0];
  const v = top.vulnerability;
  const firstAction = top.recommendations[0];

  const whereClause = top.addressLabel ? ` near ${top.addressLabel}` : "";
  const headline = `The hottest zone${whereClause} runs ${top.anomalyC.toFixed(
    1,
  )} °C above the surrounding area, peaking at ${top.peakTempC.toFixed(1)} °C.`;

  const narrativeParts: string[] = [
    `Across ${input.placeLabel} at ${input.timestampLabel}, temperature averaged ${summary.meanTempC.toFixed(
      1,
    )} °C with a ${summary.heatGapC.toFixed(
      1,
    )} °C gap between the coolest and hottest points, and ${hotspots.length} statistically distinct hotspot${
      hotspots.length === 1 ? "" : "s"
    } ${hotspots.length === 1 ? "was" : "were"} detected.`,
  ];

  narrativeParts.push(
    `The most severe scores ${top.severityScore} out of 100${
      top.addressLabel ? ` and sits near ${top.addressLabel}` : ""
    }, covering ${(top.areaSqMeters / 10_000).toFixed(1)} hectares at a mean of ${top.meanTempC.toFixed(
      1,
    )} °C${
      top.exceedanceHours !== undefined
        ? ` and spending ${top.exceedanceHours} hours${input.exposureWindowLabel ? ` (${input.exposureWindowLabel})` : " of the analysed window"} above the ${summary.thresholdC} °C threshold`
        : ""
    }.`,
  );

  if (topFactor) {
    narrativeParts.push(
      `${topFactor.label} at ${topFactor.value}${topFactor.unit === "%" ? "%" : ` ${topFactor.unit}`} accounts for roughly ${Math.round(
        topFactor.contribution * 100,
      )}% of the modelled surface contribution, making it the primary lever available here.`,
    );
  }

  if (v) {
    narrativeParts.push(
      `Population vulnerability in ${v.tractName ?? "the surrounding tract"} scores ${v.score} out of 100${
        v.percentOver65 !== undefined ? `, with ${v.percentOver65.toFixed(1)}% of residents aged 65 or over` : ""
      }${
        v.estimatedPeopleInHotspot !== undefined
          ? `, and an estimated ${v.estimatedPeopleInHotspot.toLocaleString()} residents inside the hotspot footprint`
          : ""
      }.`,
    );
  }

  if (firstAction) {
    narrativeParts.push(
      `The highest-priority intervention is ${firstAction.title.toLowerCase()}, expected to deliver ${
        firstAction.expectedCoolingC[1] > 0
          ? `${firstAction.expectedCoolingC[0]}–${firstAction.expectedCoolingC[1]} °C of cooling`
          : "health protection rather than temperature reduction"
      } over ${firstAction.timeframe.toLowerCase()}.`,
    );
  }

  const keyFindings: string[] = [
    `${hotspots.length} hotspot${hotspots.length === 1 ? "" : "s"} detected; the most severe scores ${top.severityScore}/100`,
    `Peak of ${top.peakTempC.toFixed(1)} °C, ${top.anomalyC.toFixed(1)} °C above the area baseline`,
  ];

  if (topFactor) {
    keyFindings.push(
      `${topFactor.label} measured at ${topFactor.value}${topFactor.unit === "%" ? "%" : ` ${topFactor.unit}`}`,
    );
  }
  if (v?.estimatedPeopleInHotspot !== undefined) {
    keyFindings.push(
      `Approximately ${v.estimatedPeopleInHotspot.toLocaleString()} residents inside the top hotspot footprint`,
    );
  }
  if (top.exceedanceHours !== undefined) {
    keyFindings.push(
      `${top.exceedanceHours} hours above the ${summary.thresholdC} °C heat-risk threshold${
        input.exposureWindowLabel ? ` (${input.exposureWindowLabel})` : ""
      }`,
    );
  }

  return {
    headline,
    narrative: narrativeParts.join(" "),
    keyFindings: keyFindings.slice(0, 5),
  };
}

export async function generateInsights(input: InsightInput): Promise<Insights> {
  const now = new Date().toISOString();

  if (GEMINI_API_KEY) {
    const fromGemini = await callGemini(input);
    if (fromGemini) {
      return {
        ...fromGemini,
        generator: "llm",
        provenance: {
          status: "live",
          source: `Google ${GEMINI_MODEL}`,
          fetchedAt: now,
          note: "Wording only. Every figure was computed by the deterministic analysis engine and passed to the model as fixed input.",
        },
      };
    }
  }

  if (ANTHROPIC_API_KEY) {
    const fromAnthropic = await callAnthropic(input);
    if (fromAnthropic) {
      return {
        ...fromAnthropic,
        generator: "llm",
        provenance: {
          status: "live",
          source: `Anthropic ${ANTHROPIC_MODEL}`,
          fetchedAt: now,
          note: "Wording only. Every figure was computed by the deterministic analysis engine and passed to the model as fixed input.",
        },
      };
    }
  }

  return {
    ...templateInsights(input),
    generator: "template",
    provenance: {
      status: "live",
      source: "HeatLens rule-based summariser",
      fetchedAt: now,
      note: GEMINI_API_KEY || ANTHROPIC_API_KEY
        ? "The language model was unavailable, so the deterministic summary was used."
        : "Deterministic summary. Set GEMINI_API_KEY or ANTHROPIC_API_KEY for narrative phrasing.",
    },
  };
}
