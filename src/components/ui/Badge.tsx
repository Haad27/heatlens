"use client";

import { AlertTriangle, CheckCircle2, Clock, FlaskConical } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/format";
import type { Provenance } from "@/lib/types";

const TONES = {
  neutral: "bg-ink-100 text-ink-700 ring-ink-200",
  accent: "bg-accent-50 text-accent-800 ring-accent-200",
  warn: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-red-50 text-red-800 ring-red-200",
  info: "bg-sky-50 text-sky-800 ring-sky-200",
  violet: "bg-violet-50 text-violet-800 ring-violet-200",
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({
  children,
  tone = "neutral",
  className,
  title,
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const PROVENANCE_TONE: Record<Provenance["status"], BadgeTone> = {
  live: "accent",
  cached: "info",
  demo: "warn",
  unavailable: "danger",
};

const PROVENANCE_LABEL: Record<Provenance["status"], string> = {
  live: "Live",
  cached: "Cached",
  demo: "Demo data",
  unavailable: "Unavailable",
};

const PROVENANCE_ICON: Record<Provenance["status"], React.ComponentType<{ className?: string }>> = {
  live: CheckCircle2,
  cached: Clock,
  demo: FlaskConical,
  unavailable: AlertTriangle,
};

/**
 * Every number on screen is traceable to one of these.
 *
 * The tooltip carries the source, the vintage of the underlying observation and
 * the reason a value is demo or unavailable, so a reader can always answer
 * "where did this come from" without leaving the panel.
 */
export function ProvenanceBadge({
  provenance,
  showSource = false,
  className,
}: {
  provenance: Provenance;
  showSource?: boolean;
  className?: string;
}) {
  const Icon = PROVENANCE_ICON[provenance.status];
  const tooltip = [
    provenance.source,
    provenance.note,
    `Retrieved ${formatRelativeTime(provenance.fetchedAt)}`,
    provenance.observedAt ? `Describes ${new Date(provenance.observedAt).toLocaleString()}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Badge tone={PROVENANCE_TONE[provenance.status]} className={className} title={tooltip}>
      <Icon className="h-3 w-3" />
      {showSource ? provenance.source : PROVENANCE_LABEL[provenance.status]}
    </Badge>
  );
}
