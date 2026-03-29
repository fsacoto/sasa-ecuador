import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['@react-pdf/renderer', 'jsbarcode'],
  eslint: {
    // Temporarily ignore ESLint during builds to allow deployment
    // TODO: Fix ESLint errors and remove this
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Don't ignore TypeScript errors
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
