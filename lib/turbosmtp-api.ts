import "server-only";

import MailComposer from "nodemailer/lib/mail-composer";

// turboSMTP HTTPS API (v2) behind the same small interface as a nodemailer transport (sendMail / verify / close), so
// every email in the app can go through it. Authentication: consumerKey + consumerSecret headers (the only credential
// /mail/send accepts). Request format from turboSMTP's API reference and official SDK: comma-separated recipients,
// content / html_content, custom_headers as an object, attachments as { name, type, content (base64) }.

export const turboSmtpSendHosts = { global: "https://api.turbo-smtp.com/api/v2", eu: "https://api.eu.turbo-smtp.com/api/v2" } as const;
const managementHost = "https://pro.api.serversmtp.com/api/v2";

/** turboSMTP answers a send with `mid` (one ID, or a list in older responses); keep every ID as text. */
export const messageIdsOf = (data: unknown): string[] => {
  const mid = (data && typeof data === "object" ? (data as { mid?: unknown }).mid : undefined);
  return (Array.isArray(mid) ? mid : mid === undefined || mid === null || mid === "" ? [] : [mid]).map(String).filter(Boolean);
};
const timeoutMs = 20_000;

type Address = string | { name?: string; address: string };
export type MailMessage = {
  from: Address; to: Address | Address[]; cc?: Address | Address[]; bcc?: Address | Address[]; replyTo?: Address;
  subject: string; text?: string; html?: string;
  /** `cid`: an image shown inside the HTML (<img src="cid:…">) rather than listed as an attachment. */
  attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string; cid?: string }>;
  /** The HTML to send when inline images cannot be embedded (images linked from the web instead of cid:). */
  fallbackHtml?: string;
};

const formatAddress = (value: Address) => {
  if (typeof value === "string") return value;
  const name = value.name?.replace(/["\r\n]/g, "").trim();
  return name ? `"${name}" <${value.address}>` : value.address;
};
const addressList = (value: Address | Address[] | undefined) => (Array.isArray(value) ? value : value ? [value] : []).map(formatAddress).join(",");

/** The JSON body for POST /mail/send. */
export function turboSmtpPayload(message: MailMessage) {
  const cc = addressList(message.cc), bcc = addressList(message.bcc);
  return {
    from: formatAddress(message.from),
    to: addressList(message.to),
    subject: message.subject,
    ...(cc ? { cc } : {}),
    ...(bcc ? { bcc } : {}),
    ...(message.text ? { content: message.text } : {}),
    ...(message.html ? { html_content: message.html } : {}),
    ...(message.replyTo ? { custom_headers: { "Reply-To": formatAddress(message.replyTo) } } : {}),
    ...(message.attachments?.length ? { attachments: message.attachments.map((file) => ({
      name: file.filename,
      type: file.contentType || "application/octet-stream",
      content: Buffer.isBuffer(file.content) ? file.content.toString("base64") : Buffer.from(file.content).toString("base64"),
    })) } : {}),
  };
}

/**
 * The JSON body for a message with inline images: the API's attachments cannot be shown inside the HTML, so the whole
 * message goes as `mime_raw` (built like an SMTP send, with the images as multipart/related parts). The address fields
 * stay alongside for the envelope; Bcc is not written into the message.
 */
export async function turboSmtpRawPayload(message: MailMessage) {
  const mail = { ...message };
  delete mail.fallbackHtml;
  const raw = await new MailComposer(mail).compile().build();
  const cc = addressList(message.cc), bcc = addressList(message.bcc);
  return {
    from: formatAddress(message.from),
    to: addressList(message.to),
    subject: message.subject,
    ...(cc ? { cc } : {}),
    ...(bcc ? { bcc } : {}),
    mime_raw: raw.toString("utf8"),
  };
}

/** turboSMTP answers errors as JSON ({ message, ... }); keep its text and the HTTP status for friendlyEmailError. */
async function apiError(response: Response) {
  let detail = "";
  try {
    const body = await response.text();
    try { const data = JSON.parse(body) as Record<string, unknown>; detail = String(data.message ?? data.error ?? data.errors ?? body); }
    catch { detail = body; }
  } catch { /* no body */ }
  const status = response.status;
  const message = `turboSMTP API ${status}${detail ? `: ${detail.slice(0, 300)}` : ""}`;
  return Object.assign(new Error(message), { responseCode: status, code: status === 401 || status === 403 ? "EAUTH" : "ETURBOSMTP" });
}

async function request(url: string, init: RequestInit) {
  try { return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) }); }
  catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw Object.assign(new Error(timedOut ? "turboSMTP API timed out" : `Could not reach the turboSMTP API (${error instanceof Error ? error.message : String(error)})`), { code: timedOut ? "ETIMEDOUT" : "ECONNECTION" });
  }
}

export function turboSmtpClient(options: { consumerKey: string; consumerSecret: string; region: "global" | "eu" }) {
  const headers = { Accept: "application/json", "Content-Type": "application/json", consumerKey: options.consumerKey, consumerSecret: options.consumerSecret };
  return {
    async sendMail(message: MailMessage) {
      const send = async (body: unknown) => request(`${turboSmtpSendHosts[options.region]}/mail/send`, { method: "POST", headers, body: JSON.stringify(body) });
      let response: Response;
      if (message.attachments?.some((file) => file.cid)) {
        response = await send(await turboSmtpRawPayload(message));
        // If the raw message is refused (not a login problem), send it the usual way with the images linked instead.
        if (!response.ok && response.status !== 401 && response.status !== 403 && response.status !== 429 && response.status < 500) {
          response = await send(turboSmtpPayload({ ...message, html: message.fallbackHtml ?? message.html, attachments: message.attachments.filter((file) => !file.cid) }));
        }
      } else response = await send(turboSmtpPayload(message));
      if (!response.ok) throw await apiError(response);
      const messageIds = messageIdsOf(await response.json().catch(() => ({})));
      return { messageId: messageIds[0] ?? "", messageIds };
    },
    /** Checks the consumer key and secret with a read-only request (the account's alert settings). */
    async verify() {
      const response = await request(`${managementHost}/tools/alerts`, { method: "GET", headers });
      if (response.status === 401 || response.status === 403 || response.status >= 500) throw await apiError(response);
      return true;
    },
    /** Delivery status of one sent message (GET /analytics/{id}); UNKNOWN while turboSMTP has no report for it yet. */
    async deliveryStatus(id: string) {
      const response = await request(`${managementHost}/analytics/${encodeURIComponent(id)}`, { method: "GET", headers });
      if (response.status === 404 || response.status === 400) return { id, status: "UNKNOWN", recipient: "", error: "", sendTime: "" };
      if (!response.ok) throw await apiError(response);
      const data = await response.json().catch(() => ({})) as Record<string, unknown>;
      const item = (data.data && typeof data.data === "object" ? data.data : data) as Record<string, unknown>;
      return { id, status: String(item.status ?? "UNKNOWN").toUpperCase(), recipient: String(item.recipient ?? ""), error: String(item.error ?? "").slice(0, 500), sendTime: String(item.send_time ?? "") };
    },
    close() { /* HTTPS requests: nothing to close */ },
  };
}
