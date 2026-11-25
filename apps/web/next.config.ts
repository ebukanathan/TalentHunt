import type { NextConfig } from "next";
import { managedPortraitOrigin, managedPortraitPath } from "./src/lib/portraits";

const portraitOrigin = managedPortraitOrigin(process.env.NEXT_PUBLIC_CONTESTANT_IMAGE_ORIGIN);
if (process.env.NEXT_PUBLIC_CONTESTANT_IMAGE_ORIGIN && !portraitOrigin) {
  throw new Error("NEXT_PUBLIC_CONTESTANT_IMAGE_ORIGIN must be an HTTPS origin without credentials, port, path or query.");
}

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Separate artifacts for isolated Next/Express/PostgreSQL authentication tests.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  partialPrefetching: true,
  experimental: {
    // Reusing the restored development graph produced HMR hash-mismatch reload
    // loops across routes. Keep production build caching and runtime caching.
    turbopackFileSystemCacheForDev: false,
  },
  images: {
    remotePatterns: portraitOrigin ? [new URL(`${portraitOrigin}${managedPortraitPath}contestants/*/*/*.webp`)] : [],
    localPatterns: [],
    maximumRedirects: 0,
    dangerouslyAllowLocalIP: false,
    dangerouslyAllowSVG: false,
  },
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
