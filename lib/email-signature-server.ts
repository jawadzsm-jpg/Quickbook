import "server-only";

import { and, eq } from "drizzle-orm";
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
 * The signature to add under an email the person sends, as text and HTML with public image links; undefined when they
 * have none or turned it off. The images load from /api/email-signatures/image, so mail programs that block data URLs
 * still show them.
 */
export async function emailSignatureFor(companyId: number, userId: number, request?: Request) {
  const row = await savedSignature(companyId, userId);
  if (!row?.signature.enabled) return undefined;
  const signature: EmailSignature = row.signature;
  let base = "";
  try { base = appBaseUrl(request); } catch { /* No public address: the email goes without the images. */ }
  // The update time keeps mail programs from showing an image the person has since replaced.
  const link = (kind: string) => `${base}/api/email-signatures/image?t=${row.signature.imageToken}&k=${kind}&v=${encodeURIComponent(row.signature.updatedAt)}`;
  const images = base ? { logo: row.companyLogo ? link("logo") : undefined, banner: signature.bannerData ? link("banner") : undefined } : {};
  return { text: signatureText(signature), html: signatureHtml(signature, images) };
}
