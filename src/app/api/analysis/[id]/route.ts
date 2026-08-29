import { NextResponse } from "next/server";
import { loadAnalysis } from "@/lib/analysis/pipeline";
import { describeCacheBackend } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await loadAnalysis(id);

  if (!result) {
    return NextResponse.json(
      {
        error: "That analysis is no longer available.",
        hint: `Saved analyses are held in the ${describeCacheBackend()} cache and expire after seven days. Re-run the analysis from the dashboard to generate a fresh report.`,
      },
      { status: 404 },
    );
  }

  return NextResponse.json(result);
}
