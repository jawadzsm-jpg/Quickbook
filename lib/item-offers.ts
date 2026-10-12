/** Longest an offer may run. */
export const OFFER_MAX_DAYS = 31;

/** Administrators and inventory managers create and end Today Offers; everyone with Inventory Overview sees them. */
export const canManageOffers = (user: { role: string }) => user.role === "all_admin" || user.role === "admin" || user.role === "inventory";

/** Validate an offer request; returns an error message or the cleaned values. */
export function validateOffer(input: { offerPrice: unknown; startsAt: unknown; endsAt: unknown; note: unknown; offerQuantity?: unknown }, now = Date.now()) {
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
  // Offer quantity is optional: blank means no limit.
  const quantityText = String(input.offerQuantity ?? "").trim();
  const offerQuantity = quantityText === "" ? null : Number(quantityText);
  if (offerQuantity !== null && (!Number.isFinite(offerQuantity) || offerQuantity <= 0 || offerQuantity > 1_000_000)) return { error: "Enter an offer quantity above zero, or leave it blank for no limit." } as const;
  return { value: { offerPrice: Math.round(offerPrice * 100) / 100, offerQuantity: offerQuantity === null ? null : Math.round(offerQuantity * 10_000) / 10_000, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), note } } as const;
}

/** Milliseconds for a database timestamp such as "2026-10-11 13:44:28+04" (which Safari will not parse as-is) or an ISO string. */
export const offerTime = (value: string) => new Date(String(value).replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")).getTime();

/** Offer state at a moment: running, scheduled to start, or over. */
export function offerState(offer: { startsAt: string; endsAt: string }, now = Date.now()) {
  if (offerTime(offer.endsAt) <= now) return "ended" as const;
  return offerTime(offer.startsAt) <= now ? "active" as const : "scheduled" as const;
}

/** When an offer ends, in UAE time (e.g. "11 Oct, 07:44 PM"), for shares and exports. */
export const offerEndsText = (endsAt: string) => new Intl.DateTimeFormat("en-AE", { timeZone: "Asia/Dubai", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(offerTime(endsAt));

const shareAmount = (value: number) => value.toLocaleString("en-AE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Offer quantity still available, or null for an offer without a quantity limit. */
export const offerRemaining = (offer: { offerQuantity?: number | null; soldQuantity?: number | null }) =>
  offer.offerQuantity == null ? null : Math.max(0, Math.round((Number(offer.offerQuantity) - Number(offer.soldQuantity ?? 0)) * 10_000) / 10_000);

/** Share-text pieces for an item on a running offer: the struck-through normal price, the offer price, when the offer ends (UAE time) and, for a limited offer, how many are left. */
export function offerShareText(input: { channel: "whatsapp" | "telegram" | "email"; currency: string; normalPrice: number; offerPrice: number; endsAt: string; vatLabel: string; mark?: string; remaining?: number | null }) {
  const normal = `${input.currency} ${shareAmount(input.normalPrice)}`;
  const offer = `${input.currency} ${shareAmount(input.offerPrice)}`;
  const bold = (value: string) => input.channel === "whatsapp" ? `*${value}*` : input.channel === "telegram" ? `**${value}**` : value;
  const offerLine = `${bold("TODAY OFFER")} until ${offerEndsText(input.endsAt)}${input.remaining != null ? ` · only ${shareAmount(input.remaining)} left` : ""}`;
  // Email is plain text: "AED 1,599 (was AED 1,800, VAT excluded)". Chats strike the normal price through.
  const vat = input.vatLabel.trim().replace(/^\((.*)\)$/, "$1");
  const price = input.channel === "email"
    ? `${offer} (was ${normal}${vat ? `, ${vat}` : ""})`
    : `${input.channel === "whatsapp" ? `~${normal}~` : `~~${normal}~~`} ${bold(offer)}${input.vatLabel}`;
  return {
    price,
    offerLine: input.mark ? `${input.mark} ${offerLine}` : offerLine,
  };
}
