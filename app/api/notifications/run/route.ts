import { authorizeBackupWorker } from "@/lib/backup-oidc";
import { inactivateIdleItems } from "@/lib/item-idle";
import { deliverNotificationEmails, sendDueChequeReminders } from "@/lib/notifications";

/**
 * Scheduler: every five minutes the GitHub Actions workflow (same short-lived identity as the backup worker) sends due
 * PDC reminders and any notification emails still pending, then makes items unused for 90 days with no stock inactive
 * (lib/item-idle.ts; idempotent, so repeating it every run only picks up items that just became idle).
 */
export async function POST(request: Request) {
  if (!await authorizeBackupWorker(request)) return Response.json({ error: "Unauthorized scheduler." }, { status: 401 });
  try {
    const reminders = await sendDueChequeReminders();
    const emails = await deliverNotificationEmails();
    // A failure here never blocks reminders or emails.
    const idleItems = await inactivateIdleItems().then(({ inactivated }) => ({ inactivated })).catch(() => {
      console.error(JSON.stringify({ event: "idle_item_worker_failed" }));
      return { inactivated: 0, failed: true };
    });
    return Response.json({ reminders, emails, idleItems }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error(JSON.stringify({ event: "notification_worker_failed" }));
    return Response.json({ error: "Notification scheduler failed." }, { status: 503 });
  }
}
