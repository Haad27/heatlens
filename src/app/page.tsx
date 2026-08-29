import Link from "next/link";
import { FlaskConical, Thermometer } from "lucide-react";
import LandingMapSelector from "@/components/landing/LandingMapSelector";
import { FORTYGUARD_MOCK_MODE } from "@/lib/config";

export const metadata = {
  title: "HeatLens — Urban Heat Intelligence for US cities",
};

export default function LandingPage() {
  return (
    <main className="min-h-dvh bg-[#eef6f1]">
      <header className="border-b border-emerald-100/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-800">
              <Thermometer className="h-4 w-4 text-emerald-100" />
            </span>
            <span className="text-base font-semibold tracking-tight text-ink-900">HeatLens</span>
            <span className="hidden rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800 sm:inline">
              AI-Powered Urban Climate Analysis
            </span>
          </div>
          <Link
            href="/dashboard"
            className="text-sm font-medium text-emerald-800 transition hover:text-emerald-950"
          >
            Open dashboard
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-10 sm:py-14">
        {FORTYGUARD_MOCK_MODE && (
          <div className="mb-5 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
              <FlaskConical className="h-3.5 w-3.5" />
              Demo temperature data — add a FortyGuard key for live measurements
            </span>
          </div>
        )}

        <LandingMapSelector />
      </section>
    </main>
  );
}
