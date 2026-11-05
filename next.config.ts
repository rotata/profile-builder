import type { NextConfig } from "next";

// cacheComponents (scaffold default) is intentionally off: with it, GET route
// handlers that don't touch a Next "dynamic API" can be prerendered at build
// time, and our handlers read SQLite synchronously — a stale-profile trap.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
