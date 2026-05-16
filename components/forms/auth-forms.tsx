// components/forms/auth-forms.tsx
"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import {
  signInAction,
  signUpAction,
  type AuthFormState,
} from "@/server/actions/auth";
import { AuthField } from "@/components/auth/auth-field";
import { AuthMessage } from "@/components/auth/auth-message";

const initialState: AuthFormState = { status: "idle", message: "" };

export function SignInForm() {
  const [state, action] = useActionState(signInAction, initialState);
  const hasError = state.status === "error";
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <AuthField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        errorId={hasError ? "signin-msg" : undefined}
      />
      <div>
        <AuthField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          errorId={hasError ? "signin-msg" : undefined}
        />
        <div style={{ textAlign: "right", marginTop: 6 }}>
          <Link
            href="/forgot-password"
            style={{ fontSize: 12, color: "var(--primary-glow)", textDecoration: "none" }}
          >
            Forgot password?
          </Link>
        </div>
      </div>
      <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
      <AuthMessage state={state} id="signin-msg" />
    </form>
  );
}

export function SignUpForm() {
  const [state, action] = useActionState(signUpAction, initialState);
  const hasError = state.status === "error";
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <AuthField
        label="Name"
        name="displayName"
        autoComplete="name"
        required
        errorId={hasError ? "signup-msg" : undefined}
      />
      <AuthField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        errorId={hasError ? "signup-msg" : undefined}
      />
      <AuthField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        errorId={hasError ? "signup-msg" : undefined}
      />
      <SubmitButton pendingText="Creating account…">Create account</SubmitButton>
      <AuthMessage state={state} id="signup-msg" />
    </form>
  );
}

function SubmitButton({
  children,
  pendingText,
}: {
  children: React.ReactNode;
  pendingText: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className="btn primary"
      type="submit"
      disabled={pending}
      style={{ width: "100%", marginTop: 4, height: 44, fontSize: 14 }}
    >
      {pending ? pendingText : children}
    </button>
  );
}
