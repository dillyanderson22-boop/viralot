import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium"],
  // The Chromium binary is read from disk at runtime, so file tracing must be told about it.
  outputFileTracingIncludes: {
    "/api/scan": ["./node_modules/@sparticuz/chromium/**", "./node_modules/playwright-core/**"],
    "/api/inventory": ["./node_modules/@sparticuz/chromium/**", "./node_modules/playwright-core/**"],
    "/api/admin/test": ["./node_modules/playwright-core/**"],
    // licensed OEM fonts are read from disk by the brand-font route (never in public/)
    "/api/brand-font": ["./src/brand-kit/fonts/**"],
    // the built-in OEM guidelines are read from disk when no admin file is uploaded
    "/api/guidelines": ["./src/brand-kit/oem-guidelines.md"],
    "/api/compliance": ["./src/brand-kit/oem-guidelines.md"],
    "/api/admin/guidelines": ["./src/brand-kit/oem-guidelines.md"],
  },
  partialPrefetching: true,
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
