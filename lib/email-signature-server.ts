import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, emailSignatures } from "@/db/schema";
import { appBaseUrl } from "./app-url";
import { signatureHtml, signatureText, type EmailSignature } from "./email-signature";

/** The person's saved signature for a company and the company logo it shows (null when none is saved). */
export async function savedSignature(companyId: number, userId: number) {
  const [row] = await getDb().select({ signature: emailSignatures, companyLogo: companies.logoData }).from(emailSignatures)
    .innerJoin(companies, eq(companies.id, emailSignatures.companyId))
    .where(and(eq(emailSignatures.companyId, companyId), eq(emailSignatures.userId, userId))).limit(1);
  return row ?? null;
}

/**
 * The signature to add under an email the person sends; undefined when they have none or turned it off. `html` shows
 * the logo and banner from `images`, sent inside the email (cid: links), so mail programs that block pictures from the
 * web still show them. `linkedHtml` loads them from /api/email-signatures/image instead, for a sender that cannot embed.
 */
export async function emailSignatureFor(companyId: number, userId: number, request?: Request) {
  return signatureForEmail(await savedSignature(companyId, userId), request);
}

/**
 * For Send test email, which belongs to no company: the person's most recently saved signature that is turned on, and
 * the company it belongs to; undefined when they have none.
 */
export async function latestEmailSignature(userId: number, request?: Request) {
  const [row] = await getDb().select({ signature: emailSignatures, companyLogo: companies.logoData, companyName: companies.name }).from(emailSignatures)
    .innerJoin(companies, eq(companies.id, emailSignatures.companyId))
    .where(and(eq(emailSignatures.userId, userId), eq(emailSignatures.enabled, true))).orderBy(desc(emailSignatures.updatedAt)).limit(1);
  const signature = signatureForEmail(row ?? null, request);
  return signature && row ? { ...signature, companyName: row.companyName } : undefined;
}

function signatureForEmail(row: Awaited<ReturnType<typeof savedSignature>>, request?: Request) {
  if (!row?.signature.enabled) return undefined;
  const signature: EmailSignature = row.signature;
  let base = "";
  try { base = appBaseUrl(request); } catch { /* No public address: the email goes without the images. */ }
  // The update time keeps mail programs from showing an image the person has since replaced.
  const link = (kind: string) => `${base}/api/email-signatures/image?t=${row.signature.imageToken}&k=${kind}&v=${encodeURIComponent(row.signature.updatedAt)}`;
  const linked = base ? { logo: row.companyLogo ? link("logo") : undefined, banner: signature.bannerData ? link("banner") : undefined } : {};
  const logo = embedded("logo", row.companyLogo), banner = embedded("banner", signature.bannerData);
  const html = signatureHtml(signature, { logo: logo ? `cid:${logo.cid}` : undefined, banner: banner ? `cid:${banner.cid}` : undefined });
  return { text: signatureText(signature), html, linkedHtml: signatureHtml(signature, linked), images: [logo, banner].filter((image) => image !== null) };
}

/** A data-URL image as an inline attachment the HTML refers to as cid:<kind>@signature. */
function embedded(kind: "logo" | "banner", data: string) {
  const match = /^data:(image\/(png|jpeg|gif|webp));base64,(.+)$/.exec(data);
  if (!match) return null;
  return { filename: `signature-${kind}.${match[2] === "jpeg" ? "jpg" : match[2]}`, contentType: match[1], content: Buffer.from(match[3], "base64"), cid: `${kind}@signature` };
}
