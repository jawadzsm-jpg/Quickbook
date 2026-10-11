/** Longest an offer may run. */
export const OFFER_MAX_DAYS = 31;

/** Administrators and inventory managers create and end Today Offers; everyone with Inventory Overview sees them. */
export const canManageOffers = (user: { role: string }) => user.role === "all_admin" || user.role === "admin" || user.role === "inventory";

/** Validate an offer request; returns an error message or the cleaned values. */
export function validateOffer(input: { offerPrice: unknown; startsAt: unknown; endsAt: unknown; note: unknown }, now = Date.now()) {
  const offerPrice = Number(input.offerPrice);
  const startsAt = new Date(String(input.startsAt ?? ""));
  const endsAt = new Date(String(input.endsAt ?? ""));
  const note = String(input.note ?? "").trim();
  if (!Number.isFinite(offerPrice) || offerPrice <= 0 || offerPrice > 100_000_000) return { error: "Enter an offer price above zero." } as const;
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return { error: "Choose the offer start and end." } as const;
  if (endsAt.getTime() <= startsAt.getTime()) return { error: "The offer must end after it starts." } as const;
  if (endsAt.getTime() <= now) return { error: "The offer end must be in the future." } as const;
  if (endsAt.getTime() - startsAt.getTime() > OFFER_MAX_DAYS * 86_400_000) return { error: `An offer can run for up to ${OFFER_MAX_DAYS} days.` } as const;
  if (note.length > 300) return { error: "Keep the offer note to 300 characters." } as const;
  return { value: { offerPrice: Math.round(offerPrice * 100) / 100, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), note } } as const;
}

/** Milliseconds for a database timestamp such as "2026-10-11 13:44:28+04" (which Safari will not parse as-is) or an ISO string. */
export const offerTime = (value: string) => new Date(String(value).replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")).getTime();

/** Offer state at a moment: running, scheduled to start, or over. */
export function offerState(offer: { startsAt: string; endsAt: string }, now = Date.now()) {
  if (offerTime(offer.endsAt) <= now) return "ended" as const;
  return offerTime(offer.startsAt) <= now ? "active" as const : "scheduled" as const;
}

const shareAmount = (value: number) => value.toLocaleString("en-AE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Share-text pieces for an item on a running offer: the struck-through normal price, the offer price, and when the offer ends (UAE time). */
export function offerShareText(input: { channel: "whatsapp" | "telegram" | "email"; currency: string; normalPrice: number; offerPrice: number; endsAt: string; vatLabel: string; mark?: string }) {
  const normal = `${input.currency} ${shareAmount(input.normalPrice)}`;
  const offer = `${input.currency} ${shareAmount(input.offerPrice)}`;
  const struck = input.channel === "whatsapp" ? `~${normal}~` : input.channel === "telegram" ? `~~${normal}~~` : `was ${normal}`;
  const bold = (value: string) => input.channel === "whatsapp" ? `*${value}*` : input.channel === "telegram" ? `**${value}**` : value;
  const ends = new Intl.DateTimeFormat("en-AE", { timeZone: "Asia/Dubai", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(offerTime(input.endsAt));
  const offerLine = `${bold("TODAY OFFER")} until ${ends}`;
  return {
    price: `${struck} ${bold(offer)}${input.vatLabel}`,
    offerLine: input.mark ? `${input.mark} ${offerLine}` : offerLine,
  };
}
