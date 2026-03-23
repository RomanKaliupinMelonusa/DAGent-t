import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static HTML/CSS/JS export — no Node.js server required at runtime.
  // Enables hosting on Azure Static Web Apps (Free tier, built-in CDN).
  output: "export",
};

export default nextConfig;
