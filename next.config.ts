import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    optimizePackageImports: ["framer-motion"],
  },
};

export default nextConfig;
