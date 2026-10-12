// Plain-language advice for email server failures (nodemailer errors carry `responseCode` and `code`). The server's own
// message is kept in brackets so the cause can still be looked up with the provider.

type MailError = { message?: unknown; responseCode?: unknown; code?: unknown };

export function friendlyEmailError(error: unknown, fallback = "The email could not be sent.") {
  const mail = (error && typeof error === "object" ? error : {}) as MailError;
  const raw = String(mail.message ?? (typeof error === "string" ? error : "")).trim();
  if (!raw) return fallback;
  const code = Number(mail.responseCode) || Number(raw.match(/\b([45]\d\d)\b/)?.[1]) || 0;
  const kind = String(mail.code ?? "");
  const withCause = (advice: string) => `${advice} (${raw})`;
  if (code === 566 || /limit exceeded|quota|rate limit|too many (?:messages|emails|recipients)|sending limit|daily (?:user )?sending/i.test(raw)) {
    return withCause("Your email provider's sending limit is reached. Copy the login details and send them yourself, or send the email again later.");
  }
  if (kind === "EAUTH" || code === 535 || code === 534 || /authentication|invalid login|username and password/i.test(raw)) {
    return withCause("The email server rejected the SMTP username or password. Check Admin Controls → Email server.");
  }
  // Checked before connection errors: a TLS/port mismatch also surfaces as a socket error.
  if (/wrong version number|ssl3_get_record|unknown protocol|EPROTO|packet length too long/i.test(raw) || kind === "EPROTO") {
    return withCause("The security setting does not match the port. Use port 465 with TLS, or port 587 or 2525 with STARTTLS (for turboSMTP: pro.turbo-smtp.com). Check Admin Controls → Email server.");
  }
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ECONNREFUSED"].includes(kind) || /timed? ?out|connection (?:closed|refused)|getaddrinfo|ENOTFOUND/i.test(raw)) {
    return withCause("Could not reach the email server. Check the SMTP host and port in Admin Controls → Email server, or try again later.");
  }
  if (code === 552 || /message (?:size|too large)|too big|exceeds.*size/i.test(raw)) {
    return withCause("The email is larger than the email server accepts. Send the PDF with fewer pages or smaller images.");
  }
  if ((code === 550 || code === 553 || code === 554) && /sender|from address|not (?:allowed|authori[sz]ed)|relay|verified/i.test(raw)) {
    return withCause("The email server would not send from the sender address. Use a sender email your provider has verified.");
  }
  return raw;
}
