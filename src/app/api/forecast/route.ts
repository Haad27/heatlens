import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchForecastLayer, toApiError } from "@/lib/analysis/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const RequestSchema = z.object({
  center: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  radiusMeters: z.number().min(150).max(4000).default(1200),
  offsetHours: z.number().min(0).max(12),
  granularity: z.union([z.literal(60), z.literal(80), z.literal(100)]).optional(),
});

/**
 * One hour of the 12-hour forecast.
 *
 * Kept separate from the main analysis so the time slider can request hours
 * lazily. Each hour is its own FortyGuard submission, so pre-fetching all
 * twelve would cost twelve times as much for a slider the user may never touch.
 */
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "That forecast request was not valid.", detail: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }

  try {
    const { center, radiusMeters, offsetHours, granularity } = parsed.data;
    const result = await fetchForecastLayer(center, radiusMeters, offsetHours, granularity);
    return NextResponse.json(result);
  } catch (error) {
    const { status, body } = toApiError(error);
    return NextResponse.json(body, { status });
  }
}
