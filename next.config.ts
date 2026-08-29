import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Leaflet and react-leaflet touch `window` at import time. They are only
  // loaded from client components via `next/dynamic({ ssr: false })`; this
  // keeps the server bundle from trying to evaluate them.
  serverExternalPackages: [],
  // Do not emit AGENTS.md / CLAUDE.md on every `next dev` / `next build`.
  agentRules: false,
};

export default nextConfig;
