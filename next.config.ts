import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Ensure instrumentation.ts runs (localStorage polyfill for Node).
  },
};

export default nextConfig;
