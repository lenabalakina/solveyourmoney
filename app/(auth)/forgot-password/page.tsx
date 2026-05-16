// app/(auth)/forgot-password/page.tsx
import Link from "next/link";
import { Suspense } from "react";
import { AuthMessage } from "@/components/auth/auth-message";
import { ForgotPasswordForm } from "./form";

async function ErrorDisplay({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  if (error !== "link_expired") {
    return null;
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <AuthMessage
        state={{
          status: "error",
          message: "That reset link has expired or was already used. Request a new one below.",
        }}
      />
    </div>
  );
}

export default function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
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
        <Suspense fallback={null}>
          <ErrorDisplay searchParams={searchParams} />
        </Suspense>
        <ForgotPasswordForm />
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
