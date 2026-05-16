import { notFound } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { getImportDetail } from "@/features/imports/services/importsService";
import { requireSession } from "@/server/dal/session";
import { deleteImportSession } from "@/server/actions/importSession";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("nl-NL", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: "complete" | "partial" | "failed" }) {
  const map = {
    complete: { cls: "success", label: "Imported successfully" },
    partial:  { cls: "warn",    label: "Partial import"        },
    failed:   { cls: "danger",  label: "Failed"                },
  } as const;
  const s = map[status];
  return <span className={`pill ${s.cls}`}>{s.label}</span>;
}

export default async function ImportDetailPage({
  params,
}: {
  params: Promise<{ importId: string }>;
}) {
  const { importId } = await params;
  const session = await requireSession();
  const importSession = await getImportDetail({ userId: session.userId, importId });

  if (!importSession) {
    notFound();
  }

  return (
    <AppShell active="import">
      <div className="page-hd">
        <div>
          <h1 style={{ fontFamily: "var(--font-mono)", fontSize: 18 }}>{importSession.filename}</h1>
          <div className="sub row gap-8" style={{ marginTop: 4 }}>
            <StatusBadge status={importSession.status} />
            <span>{formatDate(importSession.createdAt)}</span>
          </div>
        </div>
        <a href="/dashboard/import" className="btn ghost">← Back to imports</a>
      </div>

      <div className="metrics">
        <div className="metric accent">
          <div className="lbl">Source</div>
          <div className="val" style={{ fontSize: 22 }}>{importSession.sourceType}</div>
          <span className="delta neut">File type</span>
        </div>
        <div className="metric">
          <div className="lbl">Transactions found</div>
          <div className="val">{importSession.transactionCount}</div>
          <span className="delta neut">In this file</span>
        </div>
        <div className="metric">
          <div className="lbl">Saved</div>
          <div className="val">{importSession.savedCount}</div>
          <span className="delta up">Added to your dashboard</span>
        </div>
        <div className="metric">
          <div className="lbl">Skipped</div>
          <div className="val">{importSession.duplicateCount}</div>
          <span className="delta neut">Duplicates</span>
        </div>
      </div>

      <div className="section-hd">
        <h2>Details</h2>
      </div>

      <div className="card" style={{ padding: "20px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 32px" }}>
          <div>
            <div className="muted f-xs" style={{ marginBottom: 4 }}>Filename</div>
            <div className="mono f-sm">{importSession.filename}</div>
          </div>
          <div>
            <div className="muted f-xs" style={{ marginBottom: 4 }}>Import ID</div>
            <div className="mono f-xs" style={{ color: "var(--fg-dim)" }}>{importSession.id}</div>
          </div>
          <div>
            <div className="muted f-xs" style={{ marginBottom: 4 }}>Imported on</div>
            <div className="f-sm">{formatDate(importSession.createdAt)}</div>
          </div>
          <div>
            <div className="muted f-xs" style={{ marginBottom: 4 }}>Status</div>
            <StatusBadge status={importSession.status} />
          </div>
        </div>
      </div>

      <div className="section-hd" style={{ marginTop: 24 }}>
        <h2>Actions</h2>
      </div>

      <div className="card" style={{ padding: "20px 24px" }}>
        <div className="f-sm" style={{ marginBottom: 16, color: "var(--fg-soft)" }}>
          Removing this import record does not reverse the transactions that were already saved to your dashboard.
        </div>
        <form
          action={async () => {
            "use server";
            await deleteImportSession(importId);
          }}
        >
          <button
            type="submit"
            className="btn"
            style={{ color: "oklch(0.84 0.10 24)", borderColor: "var(--danger-soft)" }}
          >
            Remove import record
          </button>
        </form>
      </div>
    </AppShell>
  );
}
