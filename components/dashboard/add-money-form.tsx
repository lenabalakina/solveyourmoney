"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addMoneyToSavingsGoal } from "@/server/actions/dashboard";

export function AddMoneyForm({ goalId, goalLabel }: { goalId: string; goalLabel: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    startTransition(async () => {
      const result = await addMoneyToSavingsGoal({ goalId, amount: parsed });
      if (result.ok) {
        setOpen(false);
        setAmount("");
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  if (!open) {
    return (
      <button
        className="btn primary"
        type="button"
        style={{ flex: 1 }}
        onClick={() => setOpen(true)}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Add money
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8 }}>
      <input
        type="number"
        className="input mono"
        placeholder="Amount (€)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        min="0.01"
        step="0.01"
        style={{ flex: 1, height: 34, padding: "0 10px", borderRadius: 8, boxShadow: "0 0 0 1px var(--line)", background: "oklch(1 0 0 / 0.04)", border: 0, color: "var(--fg)", font: "inherit", fontSize: 12 }}
        autoFocus
        required
        aria-label={`Amount to add to ${goalLabel}`}
      />
      {error && <span className="f-xs" style={{ color: "var(--danger)", alignSelf: "center" }}>{error}</span>}
      <button className="btn primary" type="submit" disabled={isPending} style={{ height: 34, padding: "0 12px" }}>
        {isPending ? "…" : "Add"}
      </button>
      <button className="btn ghost" type="button" style={{ height: 34 }} onClick={() => { setOpen(false); setError(null); }}>
        ✕
      </button>
    </form>
  );
}
