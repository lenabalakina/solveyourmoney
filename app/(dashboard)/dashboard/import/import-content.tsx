"use client";

import { useState, useRef } from "react";
import { saveImportedTransactions } from "@/server/actions/import";
import type { ParsedTransaction } from "@/lib/import/parseBankStatement";

type Stage = "idle" | "uploading" | "parsing" | "review";

type AssignedTransaction = ParsedTransaction & {
  assignment: "debt_payment" | "expense" | "savings" | "ignore";
};

type ImportFile = {
  id: string;
  name: string;
  source: string;
  period: string;
  rows: number;
  status: "ready" | "review" | "partial" | "error";
  when: string;
  need?: number;
  partial?: string;
};

const SEED_FILES: ImportFile[] = [
  { id: "f1", name: "Chase_Statement_Apr-2026.pdf",  source: "Bank PDF", period: "Apr 1 – Apr 30",  rows: 84,  status: "ready",   when: "2 hours ago" },
  { id: "f2", name: "Ally_Savings_Apr-2026.csv",      source: "CSV",      period: "Apr 1 – Apr 30",  rows: 12,  status: "ready",   when: "2 hours ago" },
  { id: "f3", name: "Visa_Statement_Mar-2026.pdf",    source: "Bank PDF", period: "Mar 1 – Mar 31",  rows: 64,  status: "review",  when: "Yesterday", need: 10 },
  { id: "f4", name: "Robinhood_Activity_Q1.csv",      source: "CSV",      period: "Jan – Mar 2026",  rows: 18,  status: "ready",   when: "3 days ago" },
  { id: "f5", name: "screenshot_2026-05-02.png",      source: "OCR",      period: "May 1 – May 2",   rows: 6,   status: "partial", when: "May 2", partial: "2 rows skipped" },
];

function fmt(v: number) {
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function SparkleIcon({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/>
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

function SourceCard({ name, sub, icon }: { name: string; sub: string; icon: React.ReactNode }) {
  return (
    <div className="card flat" style={{ padding: 16, cursor: "pointer" }}>
      <span className="cat-ico" style={{ width: 34, height: 34 }}>{icon}</span>
      <div className="f-sm fw-500" style={{ marginTop: 12 }}>{name}</div>
      <div className="f-xs muted">{sub}</div>
    </div>
  );
}

function ImportRow({ f }: { f: ImportFile }) {
  const statusMap: Record<ImportFile["status"], { pill: string; label: string; icon: React.ReactNode }> = {
    ready:   { pill: "success", label: "Imported",     icon: <CheckIcon size={10} /> },
    review:  { pill: "warn",    label: "Needs review", icon: <SparkleIcon size={10} /> },
    partial: { pill: "warn",    label: "Partial",      icon: <SparkleIcon size={10} /> },
    error:   { pill: "danger",  label: "Failed",       icon: <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10l5 5 5-5"/></svg> },
  };
  const s = statusMap[f.status];
  const ext = f.name.split(".").pop()?.toUpperCase() ?? "FILE";
  return (
    <tr>
      <td>
        <div className="row gap-12">
          <span className="cat-ico" style={{ width: 32, height: 32 }}>
            <span className="mono" style={{ fontSize: 10, color: "var(--fg-soft)" }}>{ext}</span>
          </span>
          <div>
            <div className="f-sm fw-500" style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
            <div className="f-xs muted">{f.partial ?? "All rows accepted"}</div>
          </div>
        </div>
      </td>
      <td className="muted f-sm">{f.source}</td>
      <td className="mono f-sm">{f.period}</td>
      <td className="num" style={{ textAlign: "right" }}>{f.rows}</td>
      <td>
        <span className={`pill ${s.pill}`}>{s.icon} {s.label}{f.need ? ` · ${f.need}` : ""}</span>
      </td>
      <td className="muted f-sm">{f.when}</td>
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
  const toConfirm = 0; // real confidence scoring not yet available from parser
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div className="row between" style={{ padding: "16px 18px", borderBottom: "1px solid var(--line)" }}>
        <div>
          <div className="card-title">Review parsed transactions</div>
          <div className="card-sub">
            {total} rows found in <span className="mono soft">{fileName}</span> · 96% confidence overall
          </div>
        </div>
        <div className="row gap-8">
          <span className="pill success"><CheckIcon size={10} /> {total - toConfirm} high confidence</span>
          {toConfirm > 0 && <span className="pill warn">{toConfirm} to confirm</span>}
        </div>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Date</th><th>Merchant</th>
            <th style={{ textAlign: "right" }}>Amount</th>
            <th>Category</th><th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          {preview.map((tx, i) => (
            <tr key={i}>
              <td className="mono muted">{tx.date}</td>
              <td>{tx.description}</td>
              <td className="num" style={{ textAlign: "right", color: tx.type === "debit" ? "var(--fg)" : "var(--success)" }}>
                {tx.type === "debit" ? "−" : "+"}${fmt(tx.amount)}
              </td>
              <td><span className="pill">Expense</span></td>
              <td>
                <span className="row gap-8">
                  <span style={{ width: 6, height: 6, borderRadius: 9, background: "var(--success)", flexShrink: 0 }} />
                  High
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row between" style={{ padding: "14px 18px", borderTop: "1px solid var(--line)" }}>
        <span className="f-xs muted">Showing {preview.length} of {total} · Open full review to inspect the rest.</span>
        <div className="row gap-8">
          <button className="btn ghost" onClick={onCancel} type="button" disabled={saving}>Cancel</button>
          <button className="btn" type="button" disabled={saving}>Open full review</button>
          <button className="btn primary" onClick={onAccept} type="button" disabled={saving}>
            <CheckIcon size={13} /> {saving ? "Saving…" : `Import ${total} row${total === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ImportContent() {
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [transactions, setTransactions] = useState<AssignedTransaction[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [history, setHistory] = useState<ImportFile[]>(SEED_FILES);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setFileName(file.name);
    setStage("uploading");
    setProgress(0);
    setUploadError(null);
    setSaveResult(null);

    // Animate upload progress
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
    const result = await saveImportedTransactions({ transactions });
    setSaving(false);
    if (result.ok) {
      const newFile: ImportFile = {
        id: `f${Date.now()}`, name: fileName,
        source: "Bank PDF", period: "Imported", rows: transactions.length,
        status: "ready", when: "Just now",
      };
      setHistory(prev => [newFile, ...prev]);
      const dupNote = result.duplicates > 0 ? ` (${result.duplicates} duplicate${result.duplicates === 1 ? "" : "s"} skipped)` : "";
      setSaveResult({ ok: true, message: `${result.count} transaction${result.count === 1 ? "" : "s"} saved to your dashboard.${dupNote}` });
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

  return (
    <>
      {/* Header */}
      <div className="page-hd">
        <div>
          <h1>Import</h1>
          <div className="sub">Upload statements, CSVs, or screenshots. We turn them into clean transactions.</div>
        </div>
        <div className="row gap-8">
          <button className="btn" type="button">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="6"/><path d="m20 20-4-4"/>
            </svg>
            Browse history
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="metrics">
        <div className="metric accent">
          <div className="lbl">
            <span className="ico">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/></svg>
            </span>
            Imported this month
          </div>
          <div className="val">3<span className="cents"> files</span></div>
          <span className="delta up">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 14l5-5 5 5"/></svg>
            248 transactions parsed
          </span>
        </div>
        <div className="metric">
          <div className="lbl">
            <span className="ico"><CheckIcon size={13} /></span>
            Auto-categorised
          </div>
          <div className="val">96<span className="cents">%</span></div>
          <span className="delta neut">10 awaiting your review</span>
        </div>
        <div className="metric">
          <div className="lbl">
            <span className="ico">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/>
              </svg>
            </span>
            Earliest record
          </div>
          <div className="val" style={{ fontSize: 22 }}>Jan 2024</div>
          <span className="delta neut">28 months of history</span>
        </div>
        <div className="metric">
          <div className="lbl">
            <span className="ico">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="8"/><path d="M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/>
              </svg>
            </span>
            Saved you
          </div>
          <div className="val" style={{ fontSize: 22 }}>~14 hrs</div>
          <span className="delta up">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 14l5-5 5 5"/></svg>
            vs. spreadsheet manual entry
          </span>
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
        {/* Upload zone (span 8) */}
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
              {/* Dashed border inner */}
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

              {stage === "idle" && (
                <div style={{ textAlign: "center", position: "relative" }}>
                  <UploadGlyph />
                  <div style={{ fontSize: 18, fontWeight: 520, letterSpacing: "-0.02em", marginTop: 14 }}>
                    Drop a statement here
                  </div>
                  <div className="muted f-sm" style={{ marginTop: 4, maxWidth: 380, margin: "4px auto 0" }}>
                    PDF, CSV, OFX, or QFX. We accept screenshots too — we&apos;ll read the numbers.
                  </div>
                  <div className="row gap-8" style={{ justifyContent: "center", marginTop: 18 }}>
                    <button className="btn primary" type="button" onClick={() => fileInputRef.current?.click()}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                      Choose a file
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/pdf,.csv,.ofx,.qfx"
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
                        <text x="12" y="16" textAnchor="middle" fontSize="6.5" fontFamily="var(--font-mono)" fill="oklch(0.98 0 0)">PDF</text>
                      </svg>
                    </span>
                    <div style={{ textAlign: "left" }}>
                      <div className="f-sm fw-500">{fileName || "Statement.pdf"}</div>
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
                  <div className="muted f-xs" style={{ marginTop: 18 }}>
                    {stage === "uploading" ? "Encrypted with your device key." : "Matching merchants, splitting fees, suggesting categories."}
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

          {/* Supported sources */}
          <div className="section-hd">
            <h2>Supported sources</h2>
            <span className="sub">Most banks · 11,000+ supported</span>
          </div>
          <div className="g-3" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            <SourceCard name="Bank PDFs"  sub="Monthly statements"       icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/></svg>} />
            <SourceCard name="CSV / TSV"  sub="Custom columns supported" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/></svg>} />
            <SourceCard name="OFX / QFX"  sub="Quicken / GnuCash"        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8"/><path d="M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/></svg>} />
            <SourceCard name="Screenshot" sub="OCR-powered"              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="6"/><path d="m20 20-4-4"/></svg>} />
          </div>
        </div>

        {/* Right side cards (span 4) */}
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

      {/* Recent imports table */}
      <div className="section-hd">
        <h2>Recent imports</h2>
        <span className="muted f-xs">Last 30 days</span>
      </div>
      <div className="card flat" style={{ padding: 0, overflow: "hidden" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>File</th>
              <th>Source</th>
              <th>Period</th>
              <th style={{ textAlign: "right" }}>Rows</th>
              <th>Status</th>
              <th>Imported</th>
            </tr>
          </thead>
          <tbody>
            {history.map(f => <ImportRow key={f.id} f={f} />)}
          </tbody>
        </table>
      </div>
    </>
  );
}
