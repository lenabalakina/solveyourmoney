import { assertMockDataAllowed } from "@/lib/mocks/mockGuards";
import { ImportsResponseSchema, ImportSessionSchema } from "./importsSchema";
import type { ImportsResponse, ImportSession } from "./importsSchema";

const MOCK_SESSIONS: ImportSession[] = [
  {
    id: "mock-imp-1",
    filename: "ING_Statement_May-2026.csv",
    sourceType: "CSV",
    transactionCount: 48,
    savedCount: 46,
    duplicateCount: 2,
    status: "complete",
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "mock-imp-2",
    filename: "ABN_AMRO_Apr-2026.csv",
    sourceType: "CSV",
    transactionCount: 31,
    savedCount: 31,
    duplicateCount: 0,
    status: "complete",
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
];

export function getImports({ userId }: { userId: string }): ImportsResponse {
  assertMockDataAllowed("imports");
  return ImportsResponseSchema.parse({
    userId,
    sessions: MOCK_SESSIONS,
    timestamp: new Date().toISOString(),
  });
}

export function getImportDetail({
  userId,
  importId,
}: {
  userId: string;
  importId: string;
}): ImportSession | null {
  assertMockDataAllowed("imports");
  void userId;
  return MOCK_SESSIONS.find((s) => s.id === importId) ?? null;
}
