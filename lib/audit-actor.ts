// The user shown in the Audit Trail "By" column comes from the entry's details: actorName / actorEmail / by in JSON details,
// "by name@company" in plain text, or a trailing "(by …)" kept when an All-Admin edited the text.
export function auditActor(details: unknown) {
  const text = String(details || "");
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return String(parsed.actorName || parsed.actorEmail || parsed.by || "") || "—";
  } catch { /* plain text */ }
  const kept = /\(by ([^()]+)\)\s*$/.exec(text);
  if (kept) return kept[1].trim();
  const match = /by ([^\s,;]+@[^\s,;]+)/.exec(text);
  return match?.[1] ?? "—";
}

/** Edited details keep the original entry's user when the new text no longer names one. */
export function keepAuditActor(previous: string, next: string) {
  const actor = auditActor(previous);
  if (actor === "—" || auditActor(next) !== "—") return next;
  try {
    const parsed = JSON.parse(next) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return JSON.stringify({ ...parsed, actorName: actor });
  } catch { /* plain text */ }
  return `${next} (by ${actor})`;
}
