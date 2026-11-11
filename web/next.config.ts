import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
    resolveAlias: {
      // WDK's wallet code pulls in a Node-only crypto addon; use the pure-JS build instead
      "sodium-universal": "sodium-javascript",
      "sodium-native": "sodium-javascript",
    },
  },
};

export default nextConfig;