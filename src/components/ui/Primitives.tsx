"use client";

import { cn } from "@/lib/format";

export function Card({
  children,
  className,
  as: Component = "section",
}: {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
}) {
  return (
    <Component
      className={cn(
        "rounded-xl border border-ink-200 bg-white shadow-[0_1px_2px_rgba(12,16,21,0.04)] print-shadow-none print-avoid-break",
        className,
      )}
    >
      {children}
    </Component>
  );
}

export function SectionHeading({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold tracking-tight text-ink-900">{title}</h3>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  sublabel,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  sublabel?: React.ReactNode;
  tone?: "default" | "hot" | "cool";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="truncate text-[11px] font-medium uppercase tracking-wide text-ink-400">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 text-xl font-semibold tracking-tight tnum",
          tone === "hot" && "text-red-700",
          tone === "cool" && "text-sky-700",
          tone === "default" && "text-ink-900",
        )}
      >
        {value}
      </dd>
      {sublabel && <p className="mt-0.5 text-[11px] leading-snug text-ink-500">{sublabel}</p>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-md", className)} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-200 bg-ink-50/60 px-6 py-10 text-center",
        className,
      )}
    >
      {icon && <div className="mb-3 text-ink-300">{icon}</div>}
      <p className="text-sm font-medium text-ink-800">{title}</p>
      {description && (
        <div className="mt-1.5 max-w-sm text-xs leading-relaxed text-ink-500">{description}</div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ProgressBar({
  value,
  color,
  className,
  trackClassName,
}: {
  /** 0–1. */
  value: number;
  color?: string;
  className?: string;
  trackClassName?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-ink-100", trackClassName)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", className)}
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-t border-ink-200", className)} />;
}

export function Tooltip({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <span title={label} className="cursor-help underline decoration-dotted underline-offset-2">
      {children}
    </span>
  );
}
