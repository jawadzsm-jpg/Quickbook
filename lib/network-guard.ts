import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Outbound connections to admin-supplied hosts (the SMTP server) must not reach the private network or cloud metadata.

const privateV4 = (ip: string) => {
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
};
const privateV6 = (ip: string) => {
  const value = ip.toLowerCase();
  if (value.startsWith("::ffff:")) return privateV4(value.slice(7));
  return value === "::" || value === "::1" || /^f[cd]/.test(value) || /^fe[89ab]/.test(value) || value.startsWith("ff");
};
export const isPrivateAddress = (ip: string) => (isIP(ip) === 4 ? privateV4(ip) : isIP(ip) === 6 ? privateV6(ip) : true);

export const SMTP_PORTS = [25, 465, 587, 2525] as const;

/** Null when the host may be used as a mail server; otherwise a plain-language reason. */
export async function publicMailHostError(host: string) {
  const name = host.trim().toLowerCase().replace(/\.$/, "");
  if (!name || name.length > 253 || !/^[a-z0-9.-]+$|^[0-9a-f:.]+$/.test(name)) return "Enter a valid email server name, for example smtp.gmail.com.";
  if (name === "localhost" || name.endsWith(".localhost") || name.endsWith(".internal") || name.endsWith(".local")) return "Use a public email server, not a local or internal address.";
  let addresses: string[];
  try { addresses = isIP(name) ? [name] : (await lookup(name, { all: true })).map((entry) => entry.address); }
  catch { return "The email server name could not be found. Check the spelling."; }
  if (!addresses.length || addresses.some(isPrivateAddress)) return "Use a public email server, not a private or internal network address.";
  return null;
}
