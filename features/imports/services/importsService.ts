import { resolveDataSource } from "@/lib/data-source/resolveDataSource";
import * as mockService from "./importsMockService";
import * as liveService from "./importsLiveService";
import type { ImportsResponse, ImportSession } from "./importsSchema";

type ImportsDataService = {
  getImports: (opts: { userId: string }) => ImportsResponse | Promise<ImportsResponse>;
  getImportDetail: (opts: { userId: string; importId: string }) => ImportSession | null | Promise<ImportSession | null>;
};

const service = resolveDataSource<ImportsDataService>({
  featureName: "imports",
  mockService,
  liveService,
});

export function getImports(opts: { userId: string }) {
  return service.getImports(opts);
}

export function getImportDetail(opts: { userId: string; importId: string }) {
  return service.getImportDetail(opts);
}
