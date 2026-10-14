import "server-only";

import nodemailer from "nodemailer";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { emailSettings } from "@/db/schema";
import { decryptSecret, encryptSecret } from "./secret-box";
import { turboSmtpClient, type MailMessage } from "./turbosmtp-api";
import type { DeliveryCheck } from "./email-delivery";

const settingId = 1;

export const encryptSmtpPassword = encryptSecret;
const decryptSmtpPassword = decryptSecret;

export async function getEmailSettings() {
  const [settings] = await getDb().select().from(emailSettings).where(eq(emailSettings.id, settingId)).limit(1);
  return settings ?? null;
}

export type EmailProvider = "smtp" | "turbosmtp_api";
export type ApiRegion = "global" | "eu";

export async function saveEmailSettings(input: {
  provider?: EmailProvider; apiRegion?: ApiRegion;
  host: string; port: number; secure: boolean; username: string; password?: string; fromName: string; fromEmail: string;
}) {
  const current = await getEmailSettings();
  const passwordEncrypted = input.password ? encryptSmtpPassword(input.password) : current?.passwordEncrypted ?? "";
  const values = {
    id: settingId, provider: input.provider ?? "smtp", apiRegion: input.apiRegion ?? "global", host: input.host, port: input.port, secure: input.secure, username: input.username,
    fromName: input.fromName, fromEmail: input.fromEmail, passwordEncrypted, updatedAt: new Date().toISOString(),
  };
  const [saved] = await getDb().insert(emailSettings).values(values).onConflictDoUpdate({ target: emailSettings.id, set: values }).returning();
  return saved;
}

/** What every email in the app needs from a sender: an SMTP transport or the turboSMTP API client. */
type MailClient = { sendMail(message: MailMessage): Promise<unknown>; verify(): Promise<unknown>; close(): void; deliveryStatus?(id: string): Promise<DeliveryCheck> };

/**
 * Delivery status from turboSMTP for messages sent through its API (at most 20 IDs). Throws when the email server is
 * not the turboSMTP API, because SMTP sends cannot be looked up.
 */
export async function checkDeliveries(ids: string[]) {
  const { client } = await openMailer();
  if (!client.deliveryStatus) throw new Error("Delivery status is available only when Admin Controls → Email server uses the turboSMTP API.");
  return Promise.all(ids.slice(0, 20).map((id) => client.deliveryStatus!(id)));
}

/** turboSMTP API message IDs from one send (SMTP sends return none: their delivery cannot be looked up). */
const providerIds = (result: unknown) => {
  const ids = result && typeof result === "object" ? (result as { messageIds?: unknown }).messageIds : undefined;
  return Array.isArray(ids) ? ids.map(String) : [];
};

const settingsComplete = (settings: Awaited<ReturnType<typeof getEmailSettings>>) =>
  Boolean(settings && (settings.provider === "turbosmtp_api" || settings.host) && settings.username && settings.passwordEncrypted && settings.fromEmail);

/** Opens one connection with the saved settings; reuse it for a batch of emails. */
export async function openMailer(): Promise<{ settings: NonNullable<Awaited<ReturnType<typeof getEmailSettings>>>; client: MailClient }> {
  const settings = await getEmailSettings();
  if (!settings || !settingsComplete(settings)) throw new Error("Complete the email server settings first.");
  if (settings.provider === "turbosmtp_api") {
    return { settings, client: turboSmtpClient({ consumerKey: settings.username, consumerSecret: decryptSmtpPassword(settings.passwordEncrypted), region: settings.apiRegion === "eu" ? "eu" : "global" }) };
  }
  return {
    settings,
    client: nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      auth: { user: settings.username, pass: decryptSmtpPassword(settings.passwordEncrypted) },
      connectionTimeout: 12_000,
      greetingTimeout: 12_000,
      socketTimeout: 20_000,
    }),
  };
}

export type Mailer = Awaited<ReturnType<typeof openMailer>>;
const transporter = openMailer;

export async function verifySmtpConnection() {
  const { client } = await transporter();
  await client.verify();
}

/** The sender's email signature (lib/email-signature-server.ts): its HTML shows the images sent inside the email. */
type Signature = { text: string; html: string; linkedHtml: string; images: Array<{ filename: string; contentType: string; content: Buffer; cid: string }>; logoUrl?: string };
/** The message's HTML with the signature under it, the HTML for a sender that cannot embed images, and the images. */
const withSignature = (html: string, signature?: Signature) => signature
  ? { html: `${html}${signature.html}`, fallbackHtml: `${html}${signature.linkedHtml}`, inline: signature.images }
  : { html, fallbackHtml: undefined, inline: [] };

const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);

export async function sendUserInvitation(input: { to: string; name: string; temporaryPassword: string; roleLabel: string; loginUrl: string }) {
  const { client, settings } = await transporter();
  await client.sendMail({
    from: { name: settings.fromName, address: settings.fromEmail },
    to: input.to,
    subject: "Your ComNet Accounting login",
    text: `Hello ${input.name},\n\nYour ComNet Accounting account is ready.\nRole: ${input.roleLabel}\nEmail: ${input.to}\nTemporary password: ${input.temporaryPassword}\nLogin: ${input.loginUrl}\n\nYou must change your password after signing in.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;color:#0f172a"><h2>Your ComNet Accounting account is ready</h2><p>Hello ${escapeHtml(input.name)},</p><p>An administrator created your account.</p><div style="background:#f1f5f9;border-radius:10px;padding:16px"><p><strong>Role:</strong> ${escapeHtml(input.roleLabel)}</p><p><strong>Email:</strong> ${escapeHtml(input.to)}</p><p><strong>Temporary password:</strong> <code>${escapeHtml(input.temporaryPassword)}</code></p></div><p><a href="${escapeHtml(input.loginUrl)}">Open ComNet Accounting</a></p><p>You will be asked to create a new password after signing in.</p></div>`,
  });
}

export async function emailDeliveryConfigured() {
  return settingsComplete(await getEmailSettings());
}

export async function sendPasswordReset(input: { to: string; name: string; resetUrl: string; expiresInMinutes: number }) {
  const { client, settings } = await transporter();
  await client.sendMail({
    from: { name: settings.fromName, address: settings.fromEmail },
    to: input.to,
    subject: "Reset your ComNet Accounting password",
    text: `Hello ${input.name},\n\nWe received a request to reset the password for ${input.to}.\nOpen this link to choose a new password (valid for ${input.expiresInMinutes} minutes, one use only):\n${input.resetUrl}\n\nIf you did not ask for this, ignore this email; your password stays the same.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;color:#0f172a"><h2>Reset your password</h2><p>Hello ${escapeHtml(input.name)},</p><p>We received a request to reset the password for <strong>${escapeHtml(input.to)}</strong>.</p><p><a href="${escapeHtml(input.resetUrl)}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Choose a new password</a></p><p style="color:#475569;font-size:13px">The link is valid for ${input.expiresInMinutes} minutes and works once. If you did not ask for this, ignore this email; your password stays the same.</p></div>`,
  });
}

const sentThrough = (settings: { provider: string; apiRegion: string; host: string; port: number }) =>
  settings.provider === "turbosmtp_api" ? `turboSMTP API (${settings.apiRegion === "eu" ? "EU" : "global"})` : `${settings.host}:${settings.port}`;

/** A real message through the saved settings, so sending limits and sender rules show up (a login check alone does not). */
export async function sendTestEmail(to: string, signature?: Signature) {
  const { client, settings } = await transporter();
  const result = await client.sendMail({
    from: { name: settings.fromName, address: settings.fromEmail },
    to,
    subject: "ComNet Accounting test email",
    text: `This is a test email from ComNet Accounting.\n\nIf you received it, the email server can send login, password-reset, invitation, notification and document emails.\nSent through: ${sentThrough(settings)}\nSender: ${settings.fromName} <${settings.fromEmail}>${signature ? `\n\n${signature.text}` : ""}`,
    ...(() => {
      const { html, fallbackHtml, inline } = withSignature(`<div style="font-family:Arial,sans-serif;max-width:560px;color:#0f172a"><h2>Test email</h2><p>This is a test email from ComNet Accounting.</p><p>If you received it, the email server can send login, password-reset, invitation, notification and document emails.</p><p style="color:#475569;font-size:13px">Sent through: ${escapeHtml(sentThrough(settings))}<br>Sender: ${escapeHtml(settings.fromName)} &lt;${escapeHtml(settings.fromEmail)}&gt;</p>${signature ? `<p style="color:#475569;font-size:13px">Your email signature, as customers see it under document and stock emails:</p>` : ""}${signature?.logoUrl ? `<p style="color:#475569;font-size:12px">Logo check: if the logo does not show below, <a href="${escapeHtml(signature.logoUrl)}">open the logo directly</a>.</p>` : ""}</div>`, signature);
      return { html, ...(fallbackHtml ? { fallbackHtml } : {}), ...(inline.length ? { attachments: inline } : {}) };
    })(),
  });
  // How the signature's images went, so the person can tell why a logo is missing.
  const sent = (result ?? {}) as { inlineImages?: "inline" | "linked" };
  const signatureImages = !signature ? "none" : !signature.images.some((image) => image.cid === "logo@signature") ? "no-logo" : sent.inlineImages ?? "inline";
  return { messageIds: providerIds(result), signatureImages };
}

/** One in-app notification as an email: a short title, the detail line and a link back to the app. */
export async function sendNotificationEmail(input: { to: string; name: string; title: string; body: string; appUrl: string }, mailer?: Mailer) {
  const { client, settings } = mailer ?? await transporter();
  await client.sendMail({
    from: { name: settings.fromName, address: settings.fromEmail },
    to: input.to,
    subject: input.title,
    text: `Hello ${input.name},\n\n${input.title}\n${input.body}\n\nOpen ComNet Accounting: ${input.appUrl}\n\nYou receive this because you are an administrator or accountant of the company. Turn these emails off from the notifications bell in the app.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;color:#0f172a"><p>Hello ${escapeHtml(input.name)},</p><div style="background:#f1f5f9;border-radius:10px;padding:16px"><p style="margin:0 0 6px;font-weight:bold">${escapeHtml(input.title)}</p><p style="margin:0">${escapeHtml(input.body)}</p></div><p><a href="${escapeHtml(input.appUrl)}">Open ComNet Accounting</a></p><p style="color:#475569;font-size:13px">You receive this because you are an administrator or accountant of the company. Turn these emails off from the notifications bell in the app.</p></div>`,
  });
}

export type ItemLine = { identity: string; condition: string; details: string };

/**
 * One line of a stock email in colour, text unchanged: an item line's name blue, bold and underlined, its condition red
 * and its details bold; "Price: …" red; the dashed separator grey. Other lines stay plain.
 */
function stockLineHtml(line: string, itemLines: Map<string, ItemLine>) {
  const item = itemLines.get(line.trim());
  if (item) {
    const parts = [`<strong style="color:#1d4ed8;text-decoration:underline">${escapeHtml(item.identity)}</strong>`];
    if (item.condition) parts.push(`<span style="color:#dc2626">${escapeHtml(item.condition)}</span>`);
    if (item.details) parts.push(`<strong style="color:#1f2937">${escapeHtml(item.details)}</strong>`);
    return parts.join(" | ");
  }
  if (/^-{5,}$/.test(line.trim())) return `<span style="color:#94a3b8">${escapeHtml(line)}</span>`;
  const price = /^(.*?)(Price: .+)$/.exec(line);
  if (price) return `${escapeHtml(price[1])}<span style="color:#dc2626">${escapeHtml(price[2])}</span>`;
  return escapeHtml(line);
}

const messageHtml = (text: string, itemLines: ItemLine[] = []) => {
  const lines = new Map(itemLines.map((item) => [[item.identity, item.condition, item.details].filter(Boolean).join(" | "), item]));
  const line = (value: string) => itemLines.length ? stockLineHtml(value, lines) : escapeHtml(value);
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.55;color:#0f172a;max-width:640px">${text.split(/\n{2,}/).map((paragraph) => `<p style="margin:0 0 12px">${paragraph.split("\n").map(line).join("<br>")}</p>`).join("")}</div>`;
};

/**
 * A document emailed to a customer or supplier: the person's message (plain text, kept as written) with the PDF
 * attached. Replies go to the person who sent it. More than RECIPIENTS_PER_MESSAGE addresses are sent as further
 * copies of the same email; Cc goes on the first copy only. Returns how many messages the server accepted and the
 * turboSMTP message IDs (none for SMTP), used to look up delivery later.
 */
export async function sendDocumentEmail(input: {
  to: string[][]; cc: string[]; replyTo?: { name: string; address: string }; subject: string; body: string;
  attachment?: { filename: string; content: Buffer };
  /** Bcc each batch (To is the sender), so recipients do not see each other — list emails. */
  hidden?: boolean;
  /** The sender's email signature (lib/email-signature-server.ts), added under the message. */
  signature?: Signature;
  /** Stock emails: item lines to colour (lib/smtp.ts stockLineHtml). */
  itemLines?: ItemLine[];
}) {
  const { client, settings } = await transporter();
  const { html, fallbackHtml, inline } = withSignature(messageHtml(input.body, input.itemLines), input.signature);
  const attachments = [...(input.attachment ? [{ filename: input.attachment.filename, content: input.attachment.content, contentType: "application/pdf" }] : []), ...inline];
  let sent = 0;
  const messageIds: string[] = [];
  try {
    for (const [index, to] of input.to.entries()) {
      const result = await client.sendMail({
        from: { name: settings.fromName, address: settings.fromEmail },
        ...(input.hidden ? { to: { name: settings.fromName, address: settings.fromEmail }, bcc: to } : { to }),
        ...(index === 0 && input.cc.length ? { cc: input.cc } : {}),
        ...(input.replyTo ? { replyTo: input.replyTo } : {}),
        subject: input.subject,
        text: input.signature ? `${input.body}\n\n${input.signature.text}` : input.body,
        html,
        ...(fallbackHtml ? { fallbackHtml } : {}),
        ...(attachments.length ? { attachments } : {}),
      });
      sent += 1;
      messageIds.push(...providerIds(result));
    }
    return { sent, messageIds };
  } catch (error) {
    // Earlier copies may already be on their way; the caller reports how many went out.
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), { sentMessages: sent });
  } finally { client.close(); }
}
