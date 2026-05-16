import { AppShell } from "@/components/dashboard/app-shell";
import { ImportContent } from "./import-content";
import { getImports } from "@/features/imports/services/importsService";
import { requireSession } from "@/server/dal/session";
import type { ImportSession } from "@/features/imports/services/importsSchema";

function getImportMetrics(sessions: ImportSession[]) {
  const now = new Date();
  const thisMonth = sessions.filter((s) => {
    const d = new Date(s.createdAt);
    return (
      d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    );
  });
  return {
    importsThisMonth: thisMonth.length,
    transactionsThisMonth: thisMonth.reduce((s, i) => s + i.savedCount, 0),
    totalSessions: sessions.length,
    latestImportDate:
      sessions.length > 0 ? sessions[0].createdAt : null,
  };
}

export default async function ImportPage() {
  const session = await requireSession();
  const { sessions } = await getImports({ userId: session.userId });
  const metrics = getImportMetrics(sessions);

  return (
    <AppShell active="import">
      <ImportContent initialHistory={sessions} metrics={metrics} />
    </AppShell>
  );
}
