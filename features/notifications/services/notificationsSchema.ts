import { z } from "zod";

export const NotificationSchema = z.object({
  id: z.string(),
  kind: z.enum(["win", "insight", "info"]),
  title: z.string(),
  body: z.string(),
  occurredAt: z.string(),
  xp: z.string().optional(),
});

export const NotificationsResponseSchema = z.object({
  userId: z.string(),
  notifications: z.array(NotificationSchema),
  timestamp: z.string(),
});

export type Notification = z.infer<typeof NotificationSchema>;
export type NotificationsResponse = z.infer<typeof NotificationsResponseSchema>;
