import "server-only";

// turboSMTP HTTPS API (v2) behind the same small interface as a nodemailer transport (sendMail / verify / close), so
// every email in the app can go through it. Authentication: consumerKey + consumerSecret headers (the only credential
// /mail/send accepts). Request format from turboSMTP's API reference and official SDK: comma-separated recipients,
// content / html_content, custom_headers as an object, attachments as { name, type, content (base64) }.

export const turboSmtpSendHosts = { global: "https://api.turbo-smtp.com/api/v2", eu: "https://api.eu.turbo-smtp.com/api/v2" } as const;
const managementHost = "https://pro.api.serversmtp.com/api/v2";
const timeoutMs = 20_000;

type Address = string | { name?: string; address: string };
export type MailMessage = {
  from: Address; to: Address | Address[]; cc?: Address | Address[]; bcc?: Address | Address[]; replyTo?: Address;
  subject: string; text?: string; html?: string;
  attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>;
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
      const response = await request(`${turboSmtpSendHosts[options.region]}/mail/send`, { method: "POST", headers, body: JSON.stringify(turboSmtpPayload(message)) });
      if (!response.ok) throw await apiError(response);
      const data = await response.json().catch(() => ({})) as { mid?: unknown };
      return { messageId: String(data.mid ?? "") };
    },
    /** Checks the consumer key and secret with a read-only request (the account's alert settings). */
    async verify() {
      const response = await request(`${managementHost}/tools/alerts`, { method: "GET", headers });
      if (response.status === 401 || response.status === 403 || response.status >= 500) throw await apiError(response);
      return true;
    },
    close() { /* HTTPS requests: nothing to close */ },
  };
}
