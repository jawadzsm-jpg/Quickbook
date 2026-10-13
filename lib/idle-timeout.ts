// Automatic sign-out after inactivity (client-safe; shared by the server session check, the admin API and the UI).

export const DEFAULT_IDLE_TIMEOUT_MINUTES = 15;
/** Choices offered in Users & access. 0 = never sign out for inactivity (the 12-hour session limit still applies). */
export const idleTimeoutChoices = [5, 10, 15, 30, 60, 120, 240, 480, 0] as const;
/** sessionStorage key for the message the sign-in page shows after an automatic sign-out. */
export const IDLE_NOTICE_KEY = "comnet_idle_sign_out_notice";
/** The server allows this much extra time so a throttled activity ping never ends a session before the browser does. */
export const IDLE_SERVER_GRACE_MS = 2 * 60 * 1000;

export function isValidIdleTimeout(value: unknown): value is number {
  return typeof value === "number" && (idleTimeoutChoices as readonly number[]).includes(value);
}

export function idleTimeoutLabel(minutes: number) {
  if (!minutes) return "Never";
  if (minutes < 60) return `${minutes} minutes`;
  const hours = minutes / 60;
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}
