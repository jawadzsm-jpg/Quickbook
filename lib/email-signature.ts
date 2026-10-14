// Email signatures: each user's own per company, added under document and stock-list emails. Shared by the signature
// editor (preview) and the server (the sent email).

export type EmailSignature = {
  enabled: boolean; closing: string; fullName: string; jobTitle: string; address: string;
  landline: string; fax: string; mobile: string; msn: string; skype: string; whatsapp: string; email: string; website: string;
  /** Brands banner as a data URL (PNG or JPEG). The logo is always the company logo. */
  bannerData: string;
};

export const SIGNATURE_TEXT_FIELDS = ["closing", "fullName", "jobTitle", "address", "landline", "fax", "mobile", "msn", "skype", "whatsapp", "email", "website"] as const;
export const SIGNATURE_FIELD_MAX = 200;
export const SIGNATURE_ADDRESS_MAX = 400;
/** Stored as data URLs; about 500 KB of image each. */
export const SIGNATURE_IMAGE_MAX = 700_000;
const imagePattern = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Contact lines in the order the signature shows them, three per row. */
export const SIGNATURE_CONTACTS = [
  [{ key: "landline", label: "Lan Line" }, { key: "fax", label: "Fax" }, { key: "mobile", label: "Mobile" }],
  [{ key: "msn", label: "MSN" }, { key: "skype", label: "Skype" }, { key: "whatsapp", label: "WhatsApp" }],
  [{ key: "email", label: "Email" }, { key: "website", label: "Website" }],
] as const;

export function blankSignature(user: { fullName: string; email: string }): EmailSignature {
  return { enabled: true, closing: "Thanks and regards", fullName: user.fullName, jobTitle: "", address: "", landline: "", fax: "", mobile: "", msn: "", skype: "", whatsapp: "", email: user.email, website: "", bannerData: "" };
}

/** A checked signature from a request body, or the reason it cannot be saved. */
export function readSignature(payload: Record<string, unknown>): EmailSignature | string {
  const signature = { enabled: payload.enabled !== false } as EmailSignature;
  for (const key of SIGNATURE_TEXT_FIELDS) {
    const value = String(payload[key] ?? "").replace(/\r\n/g, "\n").trim();
    const max = key === "address" ? SIGNATURE_ADDRESS_MAX : SIGNATURE_FIELD_MAX;
    if (value.length > max) return `Keep each signature line under ${max} characters.`;
    signature[key] = key === "address" ? value : value.replace(/\s*\n\s*/g, " ");
  }
  const banner = String(payload.bannerData ?? "");
  if (banner && (!imagePattern.test(banner) || banner.length > SIGNATURE_IMAGE_MAX)) return "The brands banner must be a PNG or JPEG, up to 500 KB.";
  signature.bannerData = banner;
  return signature;
}

const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
const contactRows = (signature: EmailSignature) => SIGNATURE_CONTACTS.map((row) => row.filter(({ key }) => signature[key]));

/** Plain-text signature for the text part of the email. */
export function signatureText(signature: EmailSignature) {
  const lines = [signature.closing, signature.fullName, signature.jobTitle, "", signature.address,
    ...contactRows(signature).map((row) => row.map(({ key, label }) => `${label}: ${signature[key]}`).join(" | "))];
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * The signature as email HTML (tables and inline styles, which mail programs keep). `images` are the addresses of the
 * company logo and brands banner: public links in a sent email, data URLs in the preview.
 */
export function signatureHtml(signature: EmailSignature, images: { logo?: string; banner?: string }) {
  const navy = "#123a7a", red = "#d6262f", green = "#1e9a49";
  const head = [
    signature.closing ? `<div style="font-family:Georgia,'Times New Roman',serif;font-size:17px;color:${navy}">${escapeHtml(signature.closing)}</div>` : "",
    signature.fullName ? `<div style="font-family:Georgia,'Times New Roman',serif;font-size:19px;font-weight:bold;letter-spacing:0.3px;color:${navy};text-transform:uppercase">${escapeHtml(signature.fullName)}</div>` : "",
    signature.jobTitle ? `<div style="font-size:13px;color:#475569">${escapeHtml(signature.jobTitle)}</div>` : "",
  ].join("");
  const logo = images.logo ? `<div style="margin:12px 0 10px"><img src="${escapeHtml(images.logo)}" alt="" style="display:block;max-width:320px;max-height:110px;height:auto;border:0"></div>` : "";
  const divider = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:6px 0 10px"><tr><td width="18%" style="border-top:3px solid ${red};font-size:0;line-height:0">&nbsp;</td><td style="border-top:1px solid #334155;font-size:0;line-height:0">&nbsp;</td><td width="18%" style="border-top:3px solid ${green};font-size:0;line-height:0">&nbsp;</td></tr></table>`;
  const address = signature.address ? `<div style="font-family:Georgia,'Times New Roman',serif;font-size:14px;line-height:1.45;color:#1e293b;margin-bottom:6px">${escapeHtml(signature.address).replace(/\n/g, "<br>")}</div>` : "";
  const separator = `<span style="color:${red};padding:0 10px">|</span>`;
  const contacts = contactRows(signature).filter((row) => row.length).map((row) => `<div style="font-size:13.5px;line-height:1.9;color:#1e293b">${row.map(({ key, label }) => {
    const value = escapeHtml(signature[key]);
    const shown = key === "email" ? `<a href="mailto:${value}" style="color:#1e293b;text-decoration:none">${value}</a>`
      : key === "website" ? `<a href="${/^https?:\/\//i.test(signature.website) ? value : `https://${value}`}" style="color:#1e293b;text-decoration:none">${value}</a>` : value;
    return `<strong>${label}:</strong> ${shown}`;
  }).join(separator)}</div>`).join("");
  const banner = images.banner ? `<div style="border-top:1px solid #334155;margin-top:8px;padding-top:10px"><img src="${escapeHtml(images.banner)}" alt="" style="display:block;max-width:640px;width:100%;height:auto;border:0"></div>` : "";
  const hasBody = address || contacts;
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:660px;margin-top:20px">${head}${logo}${hasBody ? divider : ""}${address}${contacts}${banner}</div>`;
}
