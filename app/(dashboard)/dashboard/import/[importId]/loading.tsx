import { AppShell } from "@/components/dashboard/app-shell";

export default function ImportDetailLoading() {
  return (
    <AppShell active="import">
      <div className="page-hd">
        <div>
          <div style={{ height: 28, width: 220, borderRadius: 6, background: "var(--bg-2)", marginBottom: 8 }} />
          <div style={{ height: 16, width: 160, borderRadius: 4, background: "var(--bg-2)" }} />
        </div>
      </div>
      <div className="card" style={{ padding: 40, textAlign: "center" }}>
        <div className="muted f-sm">Loading import details…</div>
      </div>
    </AppShell>
  );
}
