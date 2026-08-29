import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono-stack",
});

export const metadata: Metadata = {
  title: {
    default: "HeatLens — Urban Heat Intelligence",
    template: "%s · HeatLens",
  },
  description:
    "Find dangerous urban heat hotspots anywhere in the United States, understand what is driving them, see who is exposed, and get costed cooling recommendations.",
  applicationName: "HeatLens",
  keywords: [
    "urban heat island",
    "heat vulnerability",
    "city planning",
    "climate resilience",
    "tree canopy",
    "cooling centre",
  ],
  openGraph: {
    title: "HeatLens — Urban Heat Intelligence",
    description:
      "Hyperlocal heat hotspot detection, causal attribution and costed cooling recommendations for US cities.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0c1015",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
