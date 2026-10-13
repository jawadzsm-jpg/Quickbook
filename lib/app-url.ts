// The public address used in emailed links (password reset, invitations, notifications). Taken from configuration, never
// from the request's Host header, so a forged Host cannot point a reset link at another site.
export function appBaseUrl(request?: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  // Vercel sets the production domain for every deployment.
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  // Local development only.
  if (process.env.NODE_ENV !== "production" && request) return new URL(request.url).origin;
  throw new Error("Set NEXT_PUBLIC_APP_URL to the application's public address.");
}
