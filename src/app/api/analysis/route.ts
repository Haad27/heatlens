import { NextResponse } from "next/server";
import { z } from "zod";
import { GRANULARITIES, MIN_HISTORICAL_DATE } from "@/lib/config";
import { AnalysisError, runAnalysis, toApiError } from "@/lib/analysis/pipeline";
import type { AnalysisRequest } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * FortyGuard is asynchronous: a submission is followed by polling that can run
 * for a minute or more on a large area at fine granularity. Vercel's default
 * function timeout is well below that, so it is raised here. On the Hobby plan
 * the ceiling is 60 seconds and this value is clamped down automatically.
 */
export const maxDuration = 300;

const RequestSchema = z.object({
  center: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  radiusMeters: z.number().min(150).max(4000).default(1200),
  mode: z.enum(["historical", "current", "forecast"]).default("current"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .optional(),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Time must be HH:MM")
    .optional(),
  forecastOffsetHours: z.number().min(0).max(12).optional(),
  granularity: z
    .union([z.literal(60), z.literal(80), z.literal(100)])
    .optional(),
  thresholdC: z.number().min(15).max(50).optional(),
  placeLabel: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(payload);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: "That request was not valid.",
        detail: first ? `${first.path.join(".")}: ${first.message}` : undefined,
        hint: `Granularity must be one of ${GRANULARITIES.join(", ")} metres, and historical dates start at ${MIN_HISTORICAL_DATE}.`,
      },
      { status: 400 },
    );
  }

  if (parsed.data.mode === "historical" && !parsed.data.date) {
    return NextResponse.json(
      {
        error: "Historical analysis needs a date.",
        hint: "Pick a date between 2021-01-01 and today.",
      },
      { status: 400 },
    );
  }

  const reqData = parsed.data as AnalysisRequest;
  console.log(`\n📍 [Analysis Request] Location: "${reqData.placeLabel ?? 'Custom Location'}" (${reqData.center.lat.toFixed(4)}, ${reqData.center.lng.toFixed(4)})`);
  console.log(`   Mode: ${reqData.mode.toUpperCase()} | Date: ${reqData.date ?? 'N/A'} | Time: ${reqData.time ?? '15:00'} | Granularity: ${reqData.granularity ?? 100}m`);

  try {
    const result = await runAnalysis(reqData);
    console.log(`✅ [Analysis Succeeded] Found ${result.hotspots.length} hotspots | Mean Temp: ${result.summary.meanTempC.toFixed(1)}°C | Heat Gap: ${result.summary.heatGapC.toFixed(1)}°C`);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AnalysisError) {
      console.error(`❌ [Analysis Error ${error.statusCode}] ${error.message}${error.hint ? ` (Hint: ${error.hint})` : ''}`);
    } else {
      console.error(`❌ [Analysis Unexpected Error]`, error);
    }
    const { status, body } = toApiError(error);
    return NextResponse.json(body, { status });
  }
}
