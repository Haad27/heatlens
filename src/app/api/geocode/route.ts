import { NextResponse } from "next/server";
import { geocode } from "@/lib/datasources/geocoder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await geocode(query);
    return NextResponse.json(
      { results },
      {
        headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
      },
    );
  } catch {
    return NextResponse.json(
      {
        error: "Address lookup is temporarily unavailable.",
        hint: "You can still click directly on the map to choose an area.",
        results: [],
      },
      { status: 503 },
    );
  }
}
