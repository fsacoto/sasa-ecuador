import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

// Lockfile in a parent folder (e.g. ~/package-lock.json) makes Turbopack pick the wrong root; pin it to this app.
const turbopackRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: turbopackRoot,
  },
  transpilePackages: ['@react-pdf/renderer', 'jsbarcode'],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
        pathname: "/v0/b/**",
      },
    ],
  },
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
