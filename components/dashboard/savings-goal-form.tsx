"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSavingsGoal } from "@/server/actions/dashboard";

export function SavingsGoalForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [current, setCurrent] = useState("");
  const [monthly, setMonthly] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function reset() {
    setName("");
    setTarget("");
    setCurrent("");
    setMonthly("");
    setTargetDate("");
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const targetAmount = parseFloat(target);
    if (!name.trim() || isNaN(targetAmount) || targetAmount <= 0) {
      setError("Enter a valid goal name and target amount.");
      return;
    }
    const currentAmount = current ? parseFloat(current) : 0;
    const monthlyContribution = monthly ? parseFloat(monthly) : 0;
    if (isNaN(currentAmount) || currentAmount < 0) {
      setError("Current amount must be 0 or more.");
      return;
    }
    if (isNaN(monthlyContribution) || monthlyContribution < 0) {
      setError("Monthly contribution must be 0 or more.");
      return;
    }
    startTransition(async () => {
      const result = await createSavingsGoal({
        name: name.trim(),
        targetAmount,
        currentAmount,
        monthlyContribution,
        targetDate: targetDate || null,
      });
      if (result.ok) {
        setOpen(false);
        reset();
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  if (!open) {
    return (
      <button className="btn primary" type="button" onClick={() => setOpen(true)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        New goal
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ padding: "20px 24px", maxWidth: 540 }}>
      <div className="card-title" style={{ marginBottom: 16 }}>New savings goal</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label className="f-xs muted" style={{ display: "block", marginBottom: 4 }}>Goal name *</label>
          <input
            className="input"
            placeholder="e.g. Emergency Fund"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: "100%", height: 36, padding: "0 12px", borderRadius: 8, boxShadow: "0 0 0 1px var(--line)", background: "oklch(1 0 0 / 0.04)", border: 0, color: "var(--fg)", font: "inherit", fontSize: 13 }}
            autoFocus
            required
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label className="f-xs muted" style={{ display: "block", marginBottom: 4 }}>Target amount (€) *</label>
            <input
              type="number"
              className="input mono"
              placeholder="5000"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              min="1"
              step="1"
              style={{ width: "100%", height: 36, padding: "0 12px", borderRadius: 8, boxShadow: "0 0 0 1px var(--line)", background: "oklch(1 0 0 / 0.04)", border: 0, color: "var(--fg)", font: "inherit", fontSize: 13 }}
              required
            />
          </div>
          <div>
            <label className="f-xs muted" style={{ display: "block", marginBottom: 4 }}>Already saved (€)</label>
            <input
              type="number"
              className="input mono"
              placeholder="0"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              min="0"
              step="1"
              style={{ width: "100%", height: 36, padding: "0 12px", borderRadius: 8, boxShadow: "0 0 0 1px var(--line)", background: "oklch(1 0 0 / 0.04)", border: 0, color: "var(--fg)", font: "inherit", fontSize: 13 }}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label className="f-xs muted" style={{ display: "block", marginBottom: 4 }}>Monthly contribution (€)</label>
            <input
              type="number"
              className="input mono"
              placeholder="100"
              value={monthly}
              onChange={(e) => setMonthly(e.target.value)}
              min="0"
              step="1"
              style={{ width: "100%", height: 36, padding: "0 12px", borderRadius: 8, boxShadow: "0 0 0 1px var(--line)", background: "oklch(1 0 0 / 0.04)", border: 0, color: "var(--fg)", font: "inherit", fontSize: 13 }}
            />
          </div>
          <div>
            <label className="f-xs muted" style={{ display: "block", marginBottom: 4 }}>Target date (optional)</label>
            <input
              type="date"
              className="input mono"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              style={{ width: "100%", height: 36, padding: "0 12px", borderRadius: 8, boxShadow: "0 0 0 1px var(--line)", background: "oklch(1 0 0 / 0.04)", border: 0, color: "var(--fg)", font: "inherit", fontSize: 13 }}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="f-xs" style={{ color: "var(--danger)", marginTop: 10 }}>{error}</div>
      )}

      <div className="row gap-8" style={{ marginTop: 16 }}>
        <button className="btn primary" type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Create goal"}
        </button>
        <button className="btn ghost" type="button" onClick={() => { setOpen(false); reset(); }}>
          Cancel
        </button>
      </div>
    </form>
  );
}
