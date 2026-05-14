"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordResetAction, type AuthFormState } from "@/server/actions/auth";

const initial: AuthFormState = { status: "idle", message: "" };

export default function ForgotPasswordPage() {
  const [state, formAction, isPending] = useActionState(requestPasswordResetAction, initial);

  return (
    <>
      <div className="card" style={{ padding: 28 }}>
        <p
          style={{
            fontSize: 10,
            fontFamily: "var(--font-mono), monospace",
            color: "var(--fg-dim)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            margin: 0,
          }}
        >
          Reset password
        </p>
        <h2 style={{ fontSize: 22, fontWeight: 560, color: "var(--fg)", margin: "6px 0 4px" }}>
          Reset your password.
        </h2>
        <p style={{ fontSize: 13, color: "var(--fg-soft)", marginBottom: 20 }}>
          Enter your email and we&apos;ll send a reset link.
        </p>
        <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="f-xs muted">Email</span>
            <input
              required
              name="email"
              type="email"
              autoComplete="email"
              style={{
                height: 36,
                background: "oklch(1 0 0 / 0.04)",
                border: 0,
                color: "var(--fg)",
                font: "inherit",
                padding: "0 12px",
                borderRadius: 8,
                boxShadow: "0 0 0 1px var(--line)",
                outline: "none",
                fontSize: 13,
                width: "100%",
              }}
            />
          </label>
          {state.message && (
            <p
              className="f-xs"
              style={{ color: state.status === "error" ? "var(--error, #f87171)" : "var(--fg-soft)" }}
            >
              {state.message}
            </p>
          )}
          <button
            className="btn primary"
            type="submit"
            disabled={isPending}
            style={{ width: "100%", marginTop: 4 }}
          >
            {isPending ? "Sending…" : "Send reset link"}
          </button>
        </form>
      </div>
      <p
        className="f-xs"
        style={{ color: "var(--fg-soft)", textAlign: "center", marginTop: 16 }}
      >
        <Link href="/sign-in" style={{ color: "var(--primary-glow)", fontWeight: 520 }}>
          ← Back to sign in
        </Link>
      </p>
    </>
  );
}
