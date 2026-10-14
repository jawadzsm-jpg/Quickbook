import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, emailSignatures } from "@/db/schema";

// Signature images for mail programs, which load them without signing in: found by the signature's random image
// token. `k` is logo (the company logo) or banner.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const token = params.get("t") ?? "", kind = params.get("k");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token) || (kind !== "logo" && kind !== "banner")) return new Response("Not found", { status: 404 });
  const [row] = await getDb().select({ bannerData: emailSignatures.bannerData, companyLogo: companies.logoData })
    .from(emailSignatures).innerJoin(companies, eq(companies.id, emailSignatures.companyId)).where(eq(emailSignatures.imageToken, token)).limit(1);
  const data = !row ? "" : kind === "banner" ? row.bannerData : row.companyLogo;
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/.exec(data);
  if (!match) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(match[2], "base64"), { headers: { "Content-Type": match[1], "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" } });
}
