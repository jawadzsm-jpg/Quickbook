import { NextResponse, type NextRequest } from "next/server";
import { newCspNonce, pageContentSecurityPolicy } from "@/lib/content-security-policy";

// Every page gets its own script nonce. Next.js reads it from the request's Content-Security-Policy header and adds it
// to its scripts, so pages must render per request (app/layout.tsx is dynamic). API routes keep the fixed policy in
// next.config.ts; the other security headers are set there for every response.
export function proxy(request: NextRequest) {
  const policy = pageContentSecurityPolicy(newCspNonce(), process.env.NODE_ENV === "development");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [{
    // Pages only: not API routes, build assets or public images.
    source: "/((?!api/|_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)",
    missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }],
  }],
};
