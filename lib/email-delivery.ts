// Delivery status of emails sent through the turboSMTP API (client-safe). turboSMTP reports one status per message:
// NEW, DEFER, SUCCESS, OPEN, CLICK, REPORT, FAIL, SYSFAIL or UNSUB (GET /analytics/{id}).

export type DeliveryTone = "good" | "waiting" | "bad" | "unknown";
export type DeliveryCheck = { id: string; status: string; recipient: string; error: string; sendTime: string };
export type DeliverySummary = { status: string; label: string; tone: DeliveryTone; checks: DeliveryCheck[]; checkedAt: string };

const labels: Record<string, { label: string; tone: DeliveryTone }> = {
  NEW: { label: "Queued at turboSMTP", tone: "waiting" },
  DEFER: { label: "Delayed — turboSMTP is retrying", tone: "waiting" },
  SUCCESS: { label: "Delivered", tone: "good" },
  OPEN: { label: "Delivered and opened", tone: "good" },
  CLICK: { label: "Delivered, opened and clicked", tone: "good" },
  REPORT: { label: "Delivered, then reported as spam", tone: "bad" },
  FAIL: { label: "Bounced — not delivered", tone: "bad" },
  SYSFAIL: { label: "Not delivered — turboSMTP error", tone: "bad" },
  UNSUB: { label: "Delivered; recipient unsubscribed", tone: "bad" },
  UNKNOWN: { label: "Not in turboSMTP reports yet", tone: "unknown" },
};

export const deliveryLabel = (status: string) => labels[status] ?? { label: status || "Unknown", tone: "unknown" as const };

// Worst first: one bounce among several copies is what the sender needs to see.
const priority = ["FAIL", "SYSFAIL", "REPORT", "UNSUB", "DEFER", "NEW", "UNKNOWN", "SUCCESS", "OPEN", "CLICK"];

export function summarizeDelivery(checks: DeliveryCheck[], checkedAt = new Date().toISOString()): DeliverySummary {
  const statuses = checks.map((check) => check.status);
  const status = priority.find((candidate) => statuses.includes(candidate)) ?? statuses[0] ?? "UNKNOWN";
  return { status, ...deliveryLabel(status), checks, checkedAt };
}

/** Statuses that will not change any more, so the history need not offer another check. */
export const finalDelivery = (status: string) => ["SUCCESS", "OPEN", "CLICK", "REPORT", "FAIL", "SYSFAIL", "UNSUB"].includes(status);
