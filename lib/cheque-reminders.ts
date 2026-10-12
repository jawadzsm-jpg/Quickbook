// Post-dated cheque (PDC) reminders. A cheque dated after today (UAE time) reminds the company's administrators and
// accountants before it is presented: by default 7 days before the cheque date at 09:00 UAE time, or at a date and
// time a person chose. UAE time is UTC+4 all year (no daylight saving).
const UAE_OFFSET_MS = 4 * 60 * 60 * 1000;
export const DEFAULT_REMINDER_DAYS = 7;
export const DEFAULT_REMINDER_HOUR = 9;

/** Today's date in the UAE as YYYY-MM-DD. */
export function uaeToday(now = new Date()) {
  return new Date(now.getTime() + UAE_OFFSET_MS).toISOString().slice(0, 10);
}

/** A cheque is post-dated when its date is after today in the UAE. */
export function isPostDated(chequeDate: string, now = new Date()) {
  return /^\d{4}-\d{2}-\d{2}$/.test(chequeDate) && chequeDate > uaeToday(now);
}

/** UAE local "YYYY-MM-DDTHH:mm" (a datetime-local value) → ISO instant; "" when invalid. */
export function uaeLocalToIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return "";
  const time = Date.parse(`${value}:00Z`);
  return Number.isNaN(time) ? "" : new Date(time - UAE_OFFSET_MS).toISOString();
}

/** ISO instant → UAE local "YYYY-MM-DDTHH:mm" for a datetime-local field. */
export function isoToUaeLocal(iso: string | null | undefined) {
  const time = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(time) ? "" : new Date(time + UAE_OFFSET_MS).toISOString().slice(0, 16);
}

/**
 * Default reminder for a cheque date: 7 days before at 09:00 UAE time. When that moment has already passed (the
 * cheque is due within a week) the reminder is due now. Not post-dated → null.
 */
export function defaultReminderAt(chequeDate: string, now = new Date()): string | null {
  if (!isPostDated(chequeDate, now)) return null;
  const [year, month, day] = chequeDate.split("-").map(Number);
  const reminder = Date.UTC(year, month - 1, day - DEFAULT_REMINDER_DAYS, DEFAULT_REMINDER_HOUR) - UAE_OFFSET_MS;
  return new Date(Math.max(reminder, now.getTime())).toISOString();
}

/** "in 7 days", "tomorrow", "today" for the reminder notice. */
export function daysUntil(chequeDate: string, now = new Date()) {
  const days = Math.round((Date.parse(`${chequeDate}T00:00:00Z`) - Date.parse(`${uaeToday(now)}T00:00:00Z`)) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
}
