import { assertMockDataAllowed } from "@/lib/mocks/mockGuards";
import { NotificationsResponseSchema } from "./notificationsSchema";
import type { NotificationsResponse } from "./notificationsSchema";

export function getNotifications({ userId }: { userId: string }): NotificationsResponse {
  assertMockDataAllowed("notifications");
  return NotificationsResponseSchema.parse({
    userId,
    timestamp: new Date().toISOString(),
    notifications: [
      {
        id: "mock-n1",
        kind: "win",
        title: "Savings goal updated",
        body: "Your Emergency Fund grew closer to its target.",
        occurredAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        xp: "+40 XP",
      },
      {
        id: "mock-n2",
        kind: "win",
        title: "Lesson completed — Snowball vs Avalanche",
        body: "You finished this lesson and earned XP toward your next level.",
        occurredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        xp: "+80 XP",
      },
      {
        id: "mock-n3",
        kind: "info",
        title: "Budget category updated",
        body: "Your spending guidance has been recalculated with the latest category numbers.",
        occurredAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
  });
}
