"use client";

import { useState, useRef } from "react";
import { saveImportedTransactions } from "@/server/actions/import";
import { formatCurrency } from "@/lib/format";
import type { ParsedTransaction } from "@/lib/import/parseBankStatement";
import type { ImportSession } from "@/features/imports/services/importsSchema";

type Stage = "idle" | "uploading" | "parsing" | "review";

type AssignedTransaction = ParsedTransaction & {
  assignment: "debt_payment" | "expense" | "savings" | "ignore";
};

type ImportMetrics = {
  importsThisMonth: number;
  transactionsThisMonth: number;
  totalSessions: number;
  latestImportDate: string | null;
};

function formatRelDate(iso: string) {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffH = Math.floor(diffMs / 3600000);
  if (diffH < 1) return "Just now";
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "Yesterday";
  if (diffD < 7) return `${diffD} days ago`;
  return d.toLocaleDateString("nl-NL", { month: "short", day: "numeric" });
}

function UploadGlyph() {
  return (
    <svg viewBox="0 0 80 80" style={{ width: 64, height: 64, margin: "0 auto", display: "block" }}>
      <defs>
        <linearGradient id="upG" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.78 0.16 282)" />
          <stop offset="100%" stopColor="oklch(0.72 0.17 250)" />
        </linearGradient>
      </defs>
      <rect x="14" y="10" width="52" height="60" rx="8" fill="oklch(1 0 0 / 0.04)" stroke="oklch(1 0 0 / 0.12)" strokeWidth="1.5"/>
      <rect x="22" y="22" width="36" height="2.5" rx="1" fill="oklch(1 0 0 / 0.12)"/>
      <rect x="22" y="30" width="28" height="2.5" rx="1" fill="oklch(1 0 0 / 0.10)"/>
      <rect x="22" y="38" width="32" height="2.5" rx="1" fill="oklch(1 0 0 / 0.08)"/>
      <circle cx="56" cy="56" r="13" fill="url(#upG)"/>
      <path d="M56 50 L56 62 M51 55 L56 50 L61 55" fill="none" stroke="oklch(0.99 0 0)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>
    </svg>
  );
}

function CheckIcon({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4 4 10-10"/>
    </svg>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="row gap-12" style={{ padding: "12px 0", borderTop: "1px solid var(--line)" }}>
      <span style={{
        width: 24, height: 24, borderRadius: 8, flexShrink: 0,
        background: "var(--primary-soft)", color: "oklch(0.85 0.10 282)",
        display: "grid", placeItems: "center",
        fontFamily: "var(--font-mono)", fontSize: 12,
      }}>{n}</span>
      <div>
        <div className="f-sm fw-500">{title}</div>
        <div className="f-xs muted" style={{ lineHeight: 1.55 }}>{body}</div>
      </div>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="row gap-8" style={{ padding: "10px 0", borderTop: "1px solid var(--line)", fontSize: 12.5, color: "var(--fg-soft)", alignItems: "flex-start" }}>
      <span style={{ flexShrink: 0, width: 14, height: 14, marginTop: 2, color: "var(--primary-glow)" }}>
        <CheckIcon size={14} />
      </span>
      <span>{children}</span>
    </div>
  );
}

function SourceCard({ name, sub, icon, comingSoon }: { name: string; sub: string; icon: React.ReactNode; comingSoon?: boolean }) {
  return (
    <div className="card flat" style={{ padding: 16, cursor: comingSoon ? "default" : "pointer", position: "relative", opacity: comingSoon ? 0.55 : 1 }}>
      <span className="cat-ico" style={{ width: 34, height: 34 }}>{icon}</span>
      <div className="f-sm fw-500" style={{ marginTop: 12 }}>{name}</div>
      <div className="f-xs muted">{comingSoon ? "Coming soon" : sub}</div>
      {comingSoon && (
        <span style={{
          position: "absolute", top: 10, right: 10,
          fontSize: 10, fontWeight: 600, letterSpacing: "0.04em",
          padding: "2px 7px", borderRadius: 99,
          background: "var(--primary-soft)", color: "oklch(0.85 0.10 282)",
        }}>Soon</span>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: ImportSession["status"] }) {
  const map = {
    complete: { pill: "success", label: "Imported" },
    partial:  { pill: "warn",    label: "Partial"  },
    failed:   { pill: "danger",  label: "Failed"   },
  } as const;
  const s = map[status];
  return <span className={`pill ${s.pill}`}>{s.label}</span>;
}

function ImportRow({ f }: { f: ImportSession }) {
  const ext = f.filename.split(".").pop()?.toUpperCase() ?? "FILE";
  return (
    <tr>
      <td>
        <div className="row gap-12">
          <span className="cat-ico" style={{ width: 32, height: 32 }}>
            <span className="mono" style={{ fontSize: 10, color: "var(--fg-soft)" }}>{ext}</span>
          </span>
          <div>
            <div className="f-sm fw-500" style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.filename}</div>
            <div className="f-xs muted">
              {f.duplicateCount > 0 ? `${f.duplicateCount} duplicate${f.duplicateCount !== 1 ? "s" : ""} skipped` : "All rows accepted"}
            </div>
          </div>
        </div>
      </td>
      <td className="muted f-sm">{f.sourceType}</td>
      <td className="num" style={{ textAlign: "right" }}>{f.savedCount}</td>
      <td><StatusPill status={f.status} /></td>
      <td className="muted f-sm">{formatRelDate(f.createdAt)}</td>
      <td>
        <a
          href={`/dashboard/import/${f.id}`}
          className="btn ghost"
          style={{ fontSize: 12, height: 28, padding: "0 10px" }}
        >
          View
        </a>
      </td>
    </tr>
  );
}

function ParsePreview({
  transactions,
  fileName,
  onAccept,
  onCancel,
  saving,
}: {
  transactions: AssignedTransaction[];
  fileName: string;
  onAccept: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const preview = transactions.slice(0, 8);
  const total = transactions.length;
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div className="row between" style={{ padding: "16px 18px", borderBottom: "1px solid var(--line)" }}>
        <div>
          <div className="card-title">Review parsed transactions</div>
          <div className="card-sub">
            {total} rows found in <span className="mono soft">{fileName}</span>
          </div>
        </div>
        <span className="pill success"><CheckIcon size={10} /> {total} rows ready</span>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Date</th><th>Merchant</th>
            <th style={{ textAlign: "right" }}>Amount</th>
            <th>Category</th>
          </tr>
        </thead>
        <tbody>
          {preview.map((tx, i) => (
            <tr key={i}>
              <td className="mono muted">{tx.date}</td>
              <td>{tx.description}</td>
              <td className="num" style={{ textAlign: "right", color: tx.type === "debit" ? "var(--fg)" : "var(--success)" }}>
                {tx.type === "debit" ? "−" : "+"}{formatCurrency(tx.amount)}
              </td>
              <td><span className="pill">Expense</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row between" style={{ padding: "14px 18px", borderTop: "1px solid var(--line)" }}>
        <span className="f-xs muted">Showing {preview.length} of {total}</span>
        <div className="row gap-8">
          <button className="btn ghost" onClick={onCancel} type="button" disabled={saving}>Cancel</button>
          <button className="btn primary" onClick={onAccept} type="button" disabled={saving}>
            <CheckIcon size={13} /> {saving ? "Saving…" : `Import ${total} row${total === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ImportContent({
  initialHistory,
  metrics,
}: {
  initialHistory: ImportSession[];
  metrics: ImportMetrics;
}) {
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [fileExt, setFileExt] = useState("FILE");
  const [transactions, setTransactions] = useState<AssignedTransaction[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [history, setHistory] = useState<ImportSession[]>(initialHistory);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  const now = new Date();
  const thisMonthSessions = history.filter((s) => {
    const d = new Date(s.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const liveImportsThisMonth = thisMonthSessions.length;
  const liveTxThisMonth = thisMonthSessions.reduce((s, i) => s + i.savedCount, 0);

  async function handleFile(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "csv") {
      setUploadError("Only CSV files are supported right now. PDF and other formats are coming soon.");
      return;
    }
    setFileName(file.name);
    setFileExt(file.name.split(".").pop()?.toUpperCase() ?? "FILE");
    setStage("uploading");
    setProgress(0);
    setUploadError(null);
    setSaveResult(null);

    let p = 0;
    const tick = setInterval(() => {
      p += 6 + Math.random() * 10;
      if (p >= 100) {
        p = 100;
        clearInterval(tick);
        setProgress(100);
        setStage("parsing");
        doUpload(file);
      } else {
        setProgress(p);
      }
    }, 90);
  }

  async function doUpload(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/import/bank-statement", { method: "POST", body: formData });
    const json = (await res.json()) as { transactions?: ParsedTransaction[]; error?: string };

    if (!res.ok || json.error) {
      setUploadError(json.error ?? "Upload failed. Please try again.");
      setStage("idle");
      return;
    }

    const mapped = (json.transactions ?? []).map(t => ({ ...t, assignment: "expense" as const }));
    setTransactions(mapped);
    setStage("review");
  }

  async function handleAccept() {
    setSaving(true);
    const result = await saveImportedTransactions({
      transactions,
      filename: fileName,
      sourceType: fileExt,
    });
    setSaving(false);
    if (result.ok) {
      const newSession: ImportSession = {
        id: result.importSessionId,
        filename: fileName,
        sourceType: fileExt,
        transactionCount: transactions.length,
        savedCount: result.count,
        duplicateCount: result.duplicates,
        status: result.count > 0 ? "complete" : "partial",
        createdAt: new Date().toISOString(),
      };
      setHistory(prev => [newSession, ...prev]);
      const dupNote = result.duplicates > 0
        ? ` (${result.duplicates} duplicate${result.duplicates === 1 ? "" : "s"} skipped)`
        : "";
      setSaveResult({ ok: true, message: `${result.count} transaction${result.count === 1 ? "" : "s"} saved.${dupNote}` });
      setStage("idle");
      setTransactions([]);
    } else {
      setSaveResult({ ok: false, message: result.message });
      setStage("idle");
    }
  }

  function handleCancel() {
    setStage("idle");
    setTransactions([]);
    setProgress(0);
    setFileName("");
    setFileExt("FILE");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function scrollToHistory() {
    historyRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <>
      <div className="page-hd">
        <div>
          <h1>Import</h1>
          <div className="sub">Upload statements or CSVs. We turn them into clean transactions.</div>
        </div>
        {history.length > 0 && (
          <button className="btn" type="button" onClick={scrollToHistory}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="6"/><path d="m20 20-4-4"/>
            </svg>
            Browse history
          </button>
        )}
      </div>

      <div className="metrics">
        <div className="metric accent">
          <div className="lbl">Imports this month</div>
          <div className="val">{liveImportsThisMonth}<span className="cents"> files</span></div>
          {liveTxThisMonth > 0
            ? <span className="delta up"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 14l5-5 5 5"/></svg>{liveTxThisMonth} transactions</span>
            : <span className="delta neut">No imports yet</span>
          }
        </div>
        <div className="metric">
          <div className="lbl">Total imported</div>
          <div className="val">{history.reduce((s, i) => s + i.savedCount, 0)}<span className="cents"> tx</span></div>
          <span className="delta neut">All time</span>
        </div>
        <div className="metric">
          <div className="lbl">Total files</div>
          <div className="val" style={{ fontSize: 22 }}>{history.length}</div>
          <span className="delta neut">Across all imports</span>
        </div>
        <div className="metric">
          <div className="lbl">Latest import</div>
          <div className="val" style={{ fontSize: 18 }}>
            {history.length > 0 ? formatRelDate(history[0].createdAt) : "—"}
          </div>
          <span className="delta neut">{history.length > 0 ? history[0].filename.split(".").pop()?.toUpperCase() : "No imports yet"}</span>
        </div>
      </div>

      {saveResult && (
        <div style={{
          marginTop: 14, padding: "12px 16px", borderRadius: "var(--r-md)",
          background: saveResult.ok ? "var(--success-soft)" : "var(--danger-soft)",
          color: saveResult.ok ? "var(--success)" : "oklch(0.84 0.10 24)",
          fontSize: 13, fontWeight: 500, boxShadow: "0 0 0 1px var(--line)",
        }}>
          {saveResult.message}
        </div>
      )}

      <div className="g-12" style={{ marginTop: 16 }}>
        <div style={{ gridColumn: "span 8" }}>
          {stage === "review" ? (
            <ParsePreview
              transactions={transactions}
              fileName={fileName}
              onAccept={handleAccept}
              onCancel={handleCancel}
              saving={saving}
            />
          ) : (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className="card"
              style={{
                padding: "40px 28px",
                background: dragging ? "oklch(0.66 0.18 282 / 0.08)" : "var(--bg-1)",
                boxShadow: dragging
                  ? "0 0 0 1px oklch(0.66 0.18 282 / 0.5), 0 0 0 6px oklch(0.66 0.18 282 / 0.12)"
                  : "0 0 0 1px var(--line), 0 1px 0 var(--inner-hl) inset",
                transition: "all 140ms ease",
                position: "relative", overflow: "hidden",
              }}
            >
              <div style={{
                position: "absolute", inset: 14, borderRadius: 14,
                backgroundImage: [
                  "repeating-linear-gradient(90deg, var(--line-strong) 0 8px, transparent 8px 16px)",
                  "repeating-linear-gradient(180deg, var(--line-strong) 0 8px, transparent 8px 16px)",
                  "repeating-linear-gradient(90deg, var(--line-strong) 0 8px, transparent 8px 16px)",
                  "repeating-linear-gradient(180deg, var(--line-strong) 0 8px, transparent 8px 16px)",
                ].join(", "),
                backgroundSize: "100% 1px, 1px 100%, 100% 1px, 1px 100%",
                backgroundPosition: "top, right, bottom, left",
                backgroundRepeat: "no-repeat",
                pointerEvents: "none", opacity: 0.6,
              }} />

              {(stage === "idle") && (
                <div style={{ textAlign: "center", position: "relative" }}>
                  <UploadGlyph />
                  <div style={{ fontSize: 18, fontWeight: 520, letterSpacing: "-0.02em", marginTop: 14 }}>
                    Drop a statement here
                  </div>
                  <div className="muted f-sm" style={{ marginTop: 4, maxWidth: 380, margin: "4px auto 0" }}>
                    CSV files supported. Export a statement from your bank and drop it here.
                  </div>
                  <div className="row gap-8" style={{ justifyContent: "center", marginTop: 18 }}>
                    <button className="btn primary" type="button" onClick={() => fileInputRef.current?.click()}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                      Choose a file
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={handleInputChange}
                      style={{ display: "none" }}
                    />
                  </div>
                  <div className="row gap-12" style={{ justifyContent: "center", marginTop: 22, color: "var(--fg-mute)", fontSize: 11.5 }}>
                    <span className="row gap-8"><LockIcon /> End-to-end encrypted</span>
                    <span>·</span>
                    <span>Files deleted after parsing</span>
                    <span>·</span>
                    <span>Never used to train models</span>
                  </div>
                </div>
              )}

              {(stage === "uploading" || stage === "parsing") && (
                <div style={{ textAlign: "center", position: "relative", padding: "16px 0" }}>
                  <div className="row gap-12" style={{ justifyContent: "center", marginBottom: 18 }}>
                    <span className="cat-ico" style={{ width: 44, height: 44, borderRadius: 12, background: "var(--primary-soft)", color: "oklch(0.85 0.10 282)" }}>
                      <svg viewBox="0 0 24 24" style={{ width: 18, height: 18 }}>
                        <rect x="5" y="3" width="14" height="18" rx="2" fill="oklch(0.66 0.18 282 / 0.4)" stroke="oklch(0.78 0.16 282)" strokeWidth="1.2"/>
                        <text x="12" y="16" textAnchor="middle" fontSize="6.5" fontFamily="var(--font-mono)" fill="oklch(0.98 0 0)">{fileExt}</text>
                      </svg>
                    </span>
                    <div style={{ textAlign: "left" }}>
                      <div className="f-sm fw-500">{fileName || "Statement.csv"}</div>
                      <div className="f-xs muted mono">Uploading…</div>
                    </div>
                  </div>
                  <div style={{ maxWidth: 420, margin: "0 auto" }}>
                    <div className="pb thick xp">
                      <i style={{ width: `${Math.round(progress)}%`, transition: "width 80ms linear" }} />
                    </div>
                    <div className="row between mt-12" style={{ marginTop: 10 }}>
                      <span className="f-xs muted">{stage === "uploading" ? "Uploading securely" : "Reading transactions"}…</span>
                      <span className="mono f-xs">{Math.round(progress)}%</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {uploadError && (
            <div style={{
              marginTop: 14, padding: "10px 14px", borderRadius: "var(--r-md)",
              background: "var(--danger-soft)", color: "oklch(0.84 0.10 24)",
              fontSize: 12.5, fontWeight: 480,
            }}>
              {uploadError}
            </div>
          )}

          <div className="section-hd">
            <h2>Supported sources</h2>
            <span className="sub">ING, ABN AMRO, generic CSV</span>
          </div>
          <div className="g-3" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            <SourceCard name="Bank PDFs"  sub="Monthly statements"       comingSoon icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/></svg>} />
            <SourceCard name="CSV / TSV"  sub="ING, ABN, generic" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/></svg>} />
            <SourceCard name="OFX / QFX"  sub="Quicken / GnuCash"        comingSoon icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8"/><path d="M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/></svg>} />
            <SourceCard name="Screenshot" sub="OCR-powered"              comingSoon icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="6"/><path d="m20 20-4-4"/></svg>} />
          </div>
        </div>

        <div style={{ gridColumn: "span 4", display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-title">How parsing works</div>
                <div className="card-sub">Three steps, ~10 seconds.</div>
              </div>
            </div>
            <Step n="1" title="Encrypted upload" body="Files leave your device with end-to-end encryption." />
            <Step n="2" title="Smart extraction" body="We pull dates, merchants, amounts — even across multi-page tables." />
            <Step n="3" title="You review" body="Spot-check categories. We learn from your edits going forward." />
          </div>

          <div className="card">
            <div className="card-head">
              <div className="card-title">Tips for cleanest results</div>
            </div>
            <Tip>Original PDFs work best — avoid screenshots when possible.</Tip>
            <Tip>For CSVs, keep headers in the first row.</Tip>
            <Tip>Mix months in one file — we&apos;ll group them.</Tip>
            <Tip>Foreign currencies are converted with the statement&apos;s exchange date.</Tip>
          </div>
        </div>
      </div>

      <div className="section-hd" ref={historyRef}>
        <h2>Recent imports</h2>
        <span className="muted f-xs">Last 50 imports</span>
      </div>

      {history.length === 0 ? (
        <div className="card" style={{ padding: "40px 24px", textAlign: "center" }}>
          <div className="card-title" style={{ marginBottom: 8 }}>No imports yet</div>
          <div className="muted f-sm">Upload your first bank statement to see your history here.</div>
        </div>
      ) : (
        <div className="card flat" style={{ padding: 0, overflow: "hidden" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>File</th>
                <th>Source</th>
                <th style={{ textAlign: "right" }}>Saved</th>
                <th>Status</th>
                <th>Imported</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {history.map(f => <ImportRow key={f.id} f={f} />)}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
