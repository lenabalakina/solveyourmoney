"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSavingsGoal } from "@/server/actions/dashboard";

export function SavingsGoalForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const targetAmount = parseFloat(target);
    if (!name.trim() || isNaN(targetAmount) || targetAmount <= 0) {
      setError("Enter a valid name and target amount.");
      return;
    }
    startTransition(async () => {
      const result = await createSavingsGoal({ name: name.trim(), targetAmount });
      if (result.ok) {
        setOpen(false);
        setName("");
        setTarget("");
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
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
      <input
        className="input"
        placeholder="Goal name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ height: 36, padding: "0 12px", borderRadius: 8, boxShadow: "0 0 0 1px var(--line)", background: "oklch(1 0 0 / 0.04)", border: 0, color: "var(--fg)", font: "inherit", fontSize: 13 }}
        autoFocus
        required
      />
      <input
        type="number"
        className="input mono"
        placeholder="Target (€)"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        min="1"
        step="1"
        style={{ height: 36, padding: "0 12px", borderRadius: 8, boxShadow: "0 0 0 1px var(--line)", background: "oklch(1 0 0 / 0.04)", border: 0, color: "var(--fg)", font: "inherit", fontSize: 13, width: 120 }}
        required
      />
      {error && <span className="f-xs" style={{ color: "var(--danger)", alignSelf: "center" }}>{error}</span>}
      <button className="btn primary" type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Create"}
      </button>
      <button className="btn ghost" type="button" onClick={() => { setOpen(false); setError(null); }}>
        Cancel
      </button>
    </form>
  );
}
