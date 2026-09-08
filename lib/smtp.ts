import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { emailSettings } from "@/db/schema";

const settingId = 1;

function encryptionKey() {
  // Prefer a dedicated key; the existing server-only database credential keeps
  // encryption functional until that optional key is configured in Vercel.
  const secret = process.env.SMTP_ENCRYPTION_KEY || process.env.DATABASE_URL || "";
  if (secret.length < 32) throw new Error("SMTP encryption is not configured.");
  return createHash("sha256").update(secret).digest();
}

export function encryptSmtpPassword(password: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

function decryptSmtpPassword(value: string) {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("The saved SMTP password is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

export async function getEmailSettings() {
  const [settings] = await getDb().select().from(emailSettings).where(eq(emailSettings.id, settingId)).limit(1);
  return settings ?? null;
}

export async function saveEmailSettings(input: {
  host: string; port: number; secure: boolean; username: string; password?: string; fromName: string; fromEmail: string;
}) {
  const current = await getEmailSettings();
  const passwordEncrypted = input.password ? encryptSmtpPassword(input.password) : current?.passwordEncrypted ?? "";
  const values = {
    id: settingId, host: input.host, port: input.port, secure: input.secure, username: input.username,
    fromName: input.fromName, fromEmail: input.fromEmail, passwordEncrypted, updatedAt: new Date().toISOString(),
  };
  const [saved] = await getDb().insert(emailSettings).values(values).onConflictDoUpdate({ target: emailSettings.id, set: values }).returning();
  return saved;
}

async function transporter() {
  const settings = await getEmailSettings();
  if (!settings?.host || !settings.username || !settings.passwordEncrypted || !settings.fromEmail) throw new Error("Complete the SMTP settings first.");
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

export async function verifySmtpConnection() {
  const { client } = await transporter();
  await client.verify();
}

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
