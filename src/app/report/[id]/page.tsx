import type { Metadata } from "next";
import ReportView from "@/components/report/ReportView";

export const metadata: Metadata = {
  title: "Heat assessment report",
  description:
    "Shareable urban heat assessment: hotspots, contributing factors, population vulnerability and costed cooling recommendations.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReportView analysisId={id} />;
}
