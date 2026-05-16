// app/(auth)/reset-password/page.tsx
"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updatePasswordAction, type AuthFormState } from "@/server/actions/auth";
import { AuthField } from "@/components/auth/auth-field";
import { AuthMessage } from "@/components/auth/auth-message";

const initial: AuthFormState = { status: "idle", message: "" };

export default function ResetPasswordPage() {
  const [state, formAction] = useActionState(updatePasswordAction, initial);
  return (
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
        Set new password
      </p>
      <h2 style={{ fontSize: 22, fontWeight: 560, color: "var(--fg)", margin: "6px 0 4px" }}>
        Choose a new password.
      </h2>
      <p style={{ fontSize: 13, color: "var(--fg-soft)", marginBottom: 20 }}>
        Pick something strong that you&apos;ll remember.
      </p>
      <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <AuthField
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          errorId={state.status === "error" ? "reset-msg" : undefined}
        />
        <AuthMessage state={state} id="reset-msg" />
        <ResetSubmitButton />
      </form>
    </div>
  );
}

function ResetSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="btn primary"
      type="submit"
      disabled={pending}
      style={{ width: "100%", marginTop: 4, height: 44, fontSize: 14 }}
    >
      {pending ? "Saving…" : "Set new password"}
    </button>
  );
}
