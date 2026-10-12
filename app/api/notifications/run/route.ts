import { authorizeBackupWorker } from "@/lib/backup-oidc";
import { deliverNotificationEmails, sendDueChequeReminders } from "@/lib/notifications";

/**
 * Scheduler: every five minutes the GitHub Actions workflow (same short-lived identity as the backup worker) sends due
 * PDC reminders and any notification emails still pending.
 */
export async function POST(request: Request) {
  if (!await authorizeBackupWorker(request)) return Response.json({ error: "Unauthorized scheduler." }, { status: 401 });
  try {
    const reminders = await sendDueChequeReminders();
    const emails = await deliverNotificationEmails();
    return Response.json({ reminders, emails }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error(JSON.stringify({ event: "notification_worker_failed" }));
    return Response.json({ error: "Notification scheduler failed." }, { status: 503 });
  }
}
