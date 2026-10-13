import { requireApiUser } from "@/lib/auth";
import { summarizeDelivery } from "@/lib/email-delivery";
import { friendlyEmailError } from "@/lib/email-errors";
import { checkDeliveries } from "@/lib/smtp";

/** Check delivery of a test email: turboSMTP status for the message IDs the test send returned (All-Admin). */
export async function POST(request: Request) {
  const user = await requireApiUser(request, true, true);
  if (user instanceof Response) return user;
  if (user.role !== "all_admin") return Response.json({ error: "Only an All-Admin can manage the email server." }, { status: 403 });
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  const ids = Array.isArray(payload.ids) ? payload.ids.map(String).filter((id) => /^[\w.-]{1,100}$/.test(id)).slice(0, 5) : [];
  if (!ids.length) return Response.json({ error: "Send a test email through the turboSMTP API first." }, { status: 400 });
  try {
    return Response.json({ delivery: summarizeDelivery(await checkDeliveries(ids)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: friendlyEmailError(error, "Could not get the delivery status from turboSMTP.") }, { status: 502 }); }
}
