"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { requestPasswordResetAction, type AuthFormState } from "@/server/actions/auth";
import { AuthField } from "@/components/auth/auth-field";
import { AuthMessage } from "@/components/auth/auth-message";

const initial: AuthFormState = { status: "idle", message: "" };

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(requestPasswordResetAction, initial);
  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <AuthField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        errorId={state.status === "error" ? "forgot-msg" : undefined}
      />
      <AuthMessage state={state} id="forgot-msg" />
      <ForgotSubmitButton />
    </form>
  );
}

function ForgotSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="btn primary"
      type="submit"
      disabled={pending}
      style={{ width: "100%", marginTop: 4, height: 44, fontSize: 14 }}
    >
      {pending ? "Sending…" : "Send reset link"}
    </button>
  );
}
