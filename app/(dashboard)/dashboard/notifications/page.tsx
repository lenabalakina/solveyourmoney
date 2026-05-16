import { AppShell } from "@/components/dashboard/app-shell";
import { requireSession } from "@/server/dal/session";
import { NotificationsContent } from "./notifications-content";
import { getNotifications } from "@/features/notifications/services/notificationsService";

export default async function NotificationsPage() {
  const session = await requireSession();
  const { notifications } = await getNotifications({ userId: session.userId });
  return (
    <AppShell active="notifications">
      <NotificationsContent initialNotifications={notifications} />
    </AppShell>
  );
}
