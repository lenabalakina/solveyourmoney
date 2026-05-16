import { resolveDataSource } from "@/lib/data-source/resolveDataSource";
import * as mockService from "./notificationsMockService";
import * as liveService from "./notificationsLiveService";
import type { NotificationsResponse } from "./notificationsSchema";

type NotificationsDataService = {
  getNotifications: (opts: { userId: string }) => NotificationsResponse | Promise<NotificationsResponse>;
};

const service = resolveDataSource<NotificationsDataService>({
  featureName: "notifications",
  mockService,
  liveService,
});

export function getNotifications(opts: { userId: string }) {
  return service.getNotifications(opts);
}
