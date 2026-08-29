import type { Metadata } from "next";
import Dashboard from "@/components/dashboard/Dashboard";
import { FORTYGUARD_MOCK_MODE } from "@/lib/config";
import { isWithinUnitedStates } from "@/lib/geo";
import type { LatLng } from "@/lib/types";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Satellite heatmap, short-form hotspot / vegetation / correlation cards, and cooling recommendations.",
};

export const dynamic = "force-dynamic";

function parseCenter(lat?: string, lng?: string): LatLng | null {
  if (!lat || !lng) return null;
  const parsed = { lat: Number(lat), lng: Number(lng) };
  if (!Number.isFinite(parsed.lat) || !Number.isFinite(parsed.lng)) return null;
  if (!isWithinUnitedStates(parsed)) return null;
  return parsed;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const single = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  return (
    <Dashboard
      initialAnalysisId={single("id") ?? null}
      initialCenter={parseCenter(single("lat"), single("lng"))}
      initialLabel={single("label") ?? null}
      demoMode={FORTYGUARD_MOCK_MODE}
    />
  );
}
