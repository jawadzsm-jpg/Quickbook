import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Do not advertise the framework in an X-Powered-By header.
  poweredByHeader: false,
  // Never publish browser source maps in production.
  productionBrowserSourceMaps: false,
  // PGlite loads its WebAssembly from disk; bundling breaks that in local database mode.
  serverExternalPackages: ["@electric-sql/pglite"],
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "same-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        // HTTPS only for two years (Vercel adds the same header; kept here so any host enforces it).
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        // Keep other sites' windows from scripting this one; print previews opened by the app still work.
        { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        { key: "X-DNS-Prefetch-Control", value: "off" },
        { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
      ],
    }, {
      // Pages get a nonce-based script policy from proxy.ts. API responses (JSON, attachment downloads and PDFs/images
      // opened in a tab) never need scripts. object-src blocks plugins/embeds.
      source: "/api/:path*",
      headers: [
        { key: "Content-Security-Policy", value: "script-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'" },
      ],
    }];
  },
};

export default nextConfig;
