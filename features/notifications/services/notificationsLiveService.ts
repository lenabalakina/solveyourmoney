import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotificationsResponseSchema } from "./notificationsSchema";
import type { NotificationsResponse, Notification } from "./notificationsSchema";

const KIND_MAP: Record<string, Notification["kind"]> = {
  savings_added: "win",
  savings_goal_created: "win",
  learning_completed: "win",
  debt_payment: "win",
  budget_adjustment: "insight",
};

function xpForKind(kind: string): string | undefined {
  if (kind === "learning_completed") return "+80 XP";
  if (kind === "savings_added") return "+10 XP";
  return undefined;
}

export async function getNotifications({
  userId,
}: {
  userId: string;
}): Promise<NotificationsResponse> {
  const now = new Date().toISOString();
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NotificationsResponseSchema.parse({ userId, notifications: [], timestamp: now });
  }

  const { data, error } = await supabase
    .from("activity_logs")
    .select("id, kind, title, description, occurred_at")
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false })
    .limit(40);

  if (error || !data) {
    return NotificationsResponseSchema.parse({ userId, notifications: [], timestamp: now });
  }

  const notifications: Notification[] = data.map((row) => ({
    id: row.id as string,
    kind: KIND_MAP[row.kind as string] ?? "info",
    title: row.title as string,
    body: (row.description as string) ?? "",
    occurredAt: row.occurred_at as string,
    xp: xpForKind(row.kind as string),
  }));

  return NotificationsResponseSchema.parse({ userId, notifications, timestamp: now });
}
