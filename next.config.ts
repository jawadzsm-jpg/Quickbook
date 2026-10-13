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
        // object-src blocks plugins/embeds. A script-src allowlist needs per-request nonces for Next.js inline scripts
        // and is a separate change.
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
      ],
    }];
  },
};

export default nextConfig;
