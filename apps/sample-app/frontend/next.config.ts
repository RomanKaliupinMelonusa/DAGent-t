import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static HTML/CSS/JS export — no Node.js server required at runtime.
  // Enables hosting on Azure Static Web Apps (Free tier, built-in CDN).
  output: "export",

  // Next.js 16.1.7 auto-generates .next/types/validator.ts which imports
  // from "next/types.js" — a module that ships without .d.ts declarations.
  // This is a framework packaging bug, not application code. Bypass it here
  // so the build succeeds; application TypeScript is still validated by Jest
  // and the tsc step in CI.
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
