import { NextResponse } from "next/server";
import {
  ANTHROPIC_API_KEY,
  CENSUS_API_KEY,
  DEFAULT_EXCEEDANCE_THRESHOLD_C,
  DEMO_MODE,
  FORECAST_HORIZON_HOURS,
  FORTYGUARD_MOCK_MODE,
  GEMINI_API_KEY,
  MAX_AOI_SQ_MILES,
  MIN_HISTORICAL_DATE,
} from "@/lib/config";
import { describeCacheBackend } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Configuration readout for the UI.
 *
 * The dashboard uses this to decide which provenance badges and setup prompts
 * to show. It deliberately reports only whether a credential is present, never
 * any part of its value.
 */
export async function GET() {
  return NextResponse.json({
    temperature: {
      source: "FortyGuard Temperature API",
      mode: FORTYGUARD_MOCK_MODE ? "demo" : "live",
      configured: !FORTYGUARD_MOCK_MODE,
    },
    vulnerability: {
      source: "US Census Bureau ACS 5-year",
      mode: CENSUS_API_KEY ? "live" : DEMO_MODE ? "demo" : "unavailable",
      configured: Boolean(CENSUS_API_KEY),
    },
    contributingFactors: {
      source: "USGS NLCD 2021 (MRLC)",
      mode: "live",
      configured: true,
    },
    climateTrend: {
      source: "NASA POWER",
      mode: "live",
      configured: true,
    },
    narrative: {
      source: GEMINI_API_KEY
        ? "Google Gemini"
        : ANTHROPIC_API_KEY
        ? "Anthropic Claude"
        : "Rule-based summariser",
      mode: GEMINI_API_KEY || ANTHROPIC_API_KEY ? "live" : "template",
      configured: Boolean(GEMINI_API_KEY || ANTHROPIC_API_KEY),
    },
    cache: {
      backend: describeCacheBackend(),
      persistent: describeCacheBackend().includes("KV"),
    },
    limits: {
      minHistoricalDate: MIN_HISTORICAL_DATE,
      forecastHorizonHours: FORECAST_HORIZON_HOURS,
      maxAoiSqMiles: MAX_AOI_SQ_MILES,
      defaultThresholdC: DEFAULT_EXCEEDANCE_THRESHOLD_C,
    },
  });
}
