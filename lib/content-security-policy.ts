// Content-Security-Policy for app pages (set per request by proxy.ts). Scripts run only when they carry this request's
// nonce, which Next.js adds to its own scripts; 'strict-dynamic' lets those scripts load the app's code chunks. Injected
// <script> tags and inline event handlers (onclick="…") are refused, including in print popups opened with
// window.open(""), which inherit this policy (see lib/print-popup.ts).
// Styles stay 'unsafe-inline': React style attributes, chart colours and print popups rely on them, and styles cannot
// run code. Logos, stamps and attachments are data: or blob: URLs; fonts are self-hosted by next/font.
export function pageContentSecurityPolicy(nonce: string, development = false) {
  return [
    "default-src 'self'",
    // Development only: React rebuilds server error stacks with eval.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self' data: blob:",
    "frame-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Local development runs on plain http://localhost.
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/** A fresh, unguessable nonce for every page request (128 random bits). */
export function newCspNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}
