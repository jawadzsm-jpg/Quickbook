import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, emailSignatures } from "@/db/schema";

// Signature images for mail programs, which load them without signing in: found by the signature's random image
// token. `k` is logo (the company logo) or banner. Mail programs load the image every time an email is opened, so only
// the requested column is read and Vercel's CDN keeps the response (s-maxage). The link's `v` is a hash of the image
// (lib/email-signature-server.ts), so a replaced logo or banner gets a new address instead of a cached old picture.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const token = params.get("t") ?? "", kind = params.get("k");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token) || (kind !== "logo" && kind !== "banner")) return new Response("Not found", { status: 404 });
  const query = kind === "banner"
    ? getDb().select({ data: emailSignatures.bannerData }).from(emailSignatures)
    : getDb().select({ data: companies.logoData }).from(emailSignatures).innerJoin(companies, eq(companies.id, emailSignatures.companyId));
  const [row] = await query.where(eq(emailSignatures.imageToken, token)).limit(1);
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/.exec(row?.data ?? "");
  if (!match) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(match[2], "base64"), {
    headers: { "Content-Type": match[1], "Cache-Control": "public, max-age=86400, s-maxage=604800", "X-Content-Type-Options": "nosniff" },
  });
}
