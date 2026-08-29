import { Thermometer } from "lucide-react";

interface LogoProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  iconClassName?: string;
}

export default function Logo({ size = "md", className = "", iconClassName = "" }: LogoProps) {
  const sizeMap = {
    xs: {
      box: "h-6 w-6 rounded-md",
      icon: "h-3.5 w-3.5",
    },
    sm: {
      box: "h-7 w-7 rounded-lg",
      icon: "h-4 w-4",
    },
    md: {
      box: "h-8 w-8 rounded-xl",
      icon: "h-4.5 w-4.5",
    },
    lg: {
      box: "h-10 w-10 rounded-2xl",
      icon: "h-5 w-5",
    },
    xl: {
      box: "h-12 w-12 rounded-2xl",
      icon: "h-6 w-6",
    },
  };

  const { box, icon } = sizeMap[size];

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center bg-[#064e3b] shadow-sm ring-1 ring-black/10 ${box} ${className}`}
      aria-label="HeatLens Logo"
    >
      <Thermometer className={`text-white stroke-[2.25] ${icon} ${iconClassName}`} />
    </span>
  );
}

export function Brand({
  size = "md",
  showSubtitle = true,
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  showSubtitle?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <Logo size={size} />
      <span className="text-base font-semibold tracking-tight text-ink-900">HeatLens</span>
      {showSubtitle && (
        <span className="hidden rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800 sm:inline">
          AI-Powered Urban Climate Analysis
        </span>
      )}
    </div>
  );
}
