# Auth Responsive & Accessibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all Critical and High auth issues: broken mobile layout, sub-44px touch targets, missing focus rings, no password toggle, duplicated inline form code, unhandled `?error=link_expired` param, and a Supabase error message leak.

**Architecture:** Extract two shared primitives (`AuthField`, `AuthMessage`) that all auth pages use. Rewrite `AuthShell` with Tailwind responsive classes to fix the broken two-column grid on mobile. Bring `forgot-password` and `reset-password` pages onto the shared component tree, eliminating duplicated inline field code.

**Tech Stack:** Next.js 16.2.4 App Router, React 19, Tailwind CSS v4, `lucide-react` (already installed), Supabase SSR auth.

**Spec:** `docs/superpowers/specs/2026-05-16-auth-responsive-accessibility-design.md`

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `components/auth/auth-message.tsx` | Error/info message banner with role/aria |
| Create | `components/auth/auth-field.tsx` | Label + input + password toggle + focus ring + aria wiring |
| Modify | `components/auth/auth-shell.tsx` | Tailwind-responsive layout (fix broken mobile grid) |
| Modify | `app/globals.css` | Remove now-redundant `.auth-left-panel` media query |
| Modify | `components/forms/auth-forms.tsx` | Use AuthField + AuthMessage, fix SubmitButton to 44px |
| Modify | `server/actions/auth.ts` | Sanitize raw Supabase error in signUpAction |
| Create | `app/(auth)/forgot-password/form.tsx` | Inner client form component (extracted so page can be Server) |
| Modify | `app/(auth)/forgot-password/page.tsx` | Server Component: read `?error` searchParam, render AuthMessage |
| Modify | `app/(auth)/reset-password/page.tsx` | Use AuthField + AuthMessage, remove duplicated inline code |

---

## Task 1: Create AuthMessage primitive

**Files:**
- Create: `components/auth/auth-message.tsx`

- [ ] **Step 1: Create the file**

```tsx
// components/auth/auth-message.tsx
import type { AuthFormState } from "@/server/actions/auth";

interface AuthMessageProps {
  state: AuthFormState;
  id?: string;
}

export function AuthMessage({ state, id }: AuthMessageProps) {
  if (!state.message) return null;

  if (state.status === "error") {
    return (
      <div
        id={id}
        role="alert"
        style={{
          background: "var(--danger-soft)",
          color: "var(--danger)",
          borderRadius: 8,
          padding: "10px 12px",
          fontSize: 13,
        }}
      >
        {state.message}
      </div>
    );
  }

  // idle + message = info (e.g. "reset link is on its way")
  return (
    <div
      id={id}
      role="status"
      aria-live="polite"
      style={{
        background: "var(--bg-2)",
        color: "var(--fg-soft)",
        borderRadius: 8,
        padding: "10px 12px",
        fontSize: 13,
      }}
    >
      {state.message}
    </div>
  );
}
```

- [ ] **Step 2: Verify types**

```bash
npm run typecheck
```

Expected: no errors (new file only, no consumers yet).

- [ ] **Step 3: Commit**

```bash
git add components/auth/auth-message.tsx
git commit -m "feat(auth): add AuthMessage primitive with error/info variants"
```

---

## Task 2: Create AuthField primitive

**Files:**
- Create: `components/auth/auth-field.tsx`

`AuthField` is `"use client"` because it needs `useState` for the password toggle. It is always imported into other client components, so this does not affect Server Component pages.

- [ ] **Step 1: Create the file**

```tsx
// components/auth/auth-field.tsx
"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface AuthFieldProps {
  label: string;
  name: string;
  type?: "text" | "email" | "password";
  autoComplete?: string;
  errorId?: string;
  required?: boolean;
  minLength?: number;
}

export function AuthField({
  label,
  name,
  type = "text",
  autoComplete,
  errorId,
  required,
  minLength,
}: AuthFieldProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const resolvedType = isPassword && showPassword ? "text" : type;

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="f-xs muted">{label}</span>
      <div style={{ position: "relative" }}>
        <input
          name={name}
          type={resolvedType}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          aria-describedby={errorId}
          aria-invalid={errorId ? "true" : undefined}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-glow)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-1)]"
          style={{
            height: 44,
            width: "100%",
            background: "oklch(1 0 0 / 0.04)",
            border: 0,
            color: "var(--fg)",
            font: "inherit",
            paddingLeft: 12,
            paddingRight: isPassword ? 44 : 12,
            borderRadius: 8,
            boxShadow: "0 0 0 1px var(--line)",
            fontSize: 13,
          }}
        />
        {isPassword && (
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((v) => !v)}
            style={{
              position: "absolute",
              inset: 0,
              left: "auto",
              width: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: 0,
              cursor: "pointer",
              color: "var(--fg-dim)",
            }}
          >
            {showPassword ? (
              <EyeOff size={15} strokeWidth={1.75} />
            ) : (
              <Eye size={15} strokeWidth={1.75} />
            )}
          </button>
        )}
      </div>
    </label>
  );
}
```

- [ ] **Step 2: Verify types**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/auth/auth-field.tsx
git commit -m "feat(auth): add AuthField primitive with password toggle and focus ring"
```

---

## Task 3: Rewrite AuthShell to Tailwind-responsive

**Files:**
- Modify: `components/auth/auth-shell.tsx`
- Modify: `app/globals.css` (remove `.auth-left-panel` hack)

### The problem
`AuthShell` has `gridTemplateColumns: "45fr 55fr"` hardcoded inline. When `.auth-left-panel { display: none }` hides the left column on mobile, the CSS grid still has two tracks — the form panel only gets 55% of viewport width. The fix uses Tailwind responsive classes so the layout is single-column on mobile and two-column at `lg` (1024px).

- [ ] **Step 1: Rewrite auth-shell.tsx**

Replace the entire file content with:

```tsx
// components/auth/auth-shell.tsx
import type { ReactNode } from "react";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="app-bg min-h-dvh flex flex-col lg:grid lg:grid-cols-[45fr_55fr]">
      {/* Left panel — hidden on mobile/tablet, visible at lg (1024px+) */}
      <div
        className="hidden lg:flex items-center"
        style={{
          background: "var(--bg-1)",
          borderRight: "1px solid var(--line)",
          padding: 48,
        }}
      >
        <div style={{ maxWidth: 380 }}>
          {/* Brand mark */}
          <p
            style={{
              fontSize: 10,
              fontFamily: "var(--font-mono), monospace",
              color: "var(--primary-glow)",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            SolveYourMoney
          </p>

          {/* Headline */}
          <h1
            style={{
              fontSize: 38,
              fontWeight: 560,
              color: "var(--fg)",
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
              margin: "16px 0 12px",
            }}
          >
            Calm financial clarity for the next real-life decision.
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "var(--fg-soft)",
              lineHeight: 1.6,
              maxWidth: 340,
              margin: "0 0 32px",
            }}
          >
            Sign in to continue your money journey and keep your progress in one place.
          </p>

          {/* Decorative mini-preview */}
          <div className="card" style={{ opacity: 0.8, transform: "translateY(-4px)", padding: 16 }}>
            {/* XP row */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span className="pill primary" style={{ flexShrink: 0 }}>Lv 7</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: "var(--fg-dim)" }}>XP this week</span>
                  <span className="mono" style={{ fontSize: 11, color: "var(--xp)" }}>+225 XP</span>
                </div>
                <div
                  style={{
                    height: 6,
                    borderRadius: 4,
                    background: "var(--primary-soft)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: "62%",
                      height: "100%",
                      background: "var(--primary-glow)",
                      borderRadius: 4,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Metric tiles */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div className="metric accent" style={{ padding: "10px 12px" }}>
                <div className="lbl" style={{ fontSize: 10 }}>Net worth</div>
                <div className="val" style={{ fontSize: 16 }}>$4,240</div>
              </div>
              <div className="metric" style={{ padding: "10px 12px" }}>
                <div className="lbl" style={{ fontSize: 10 }}>Streak</div>
                <div className="val" style={{ fontSize: 16 }}>12 days</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel — full width on mobile, right column at lg */}
      <div className="flex-1 flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm sm:max-w-md">
          {children}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Remove the `.auth-left-panel` hack from globals.css**

Find and delete this block from `app/globals.css` (lines 156–158):

```css
@media (max-width: 767px) {
  .auth-left-panel { display: none; }
}
```

The `hidden lg:flex` classes on the left panel div in the new shell replace this rule entirely.

- [ ] **Step 3: Verify types and build**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/auth/auth-shell.tsx app/globals.css
git commit -m "fix(auth): responsive AuthShell — full-width form on mobile, two-column at lg"
```

---

## Task 4: Update auth-forms.tsx to use shared primitives

**Files:**
- Modify: `components/forms/auth-forms.tsx`

Replace the entire file content. The key changes: `Field` and `FormMessage` are replaced with `AuthField` and `AuthMessage` from the new primitives. `SubmitButton` gets `height: 44` to meet touch target requirement. The `Field` component defined locally is removed entirely.

- [ ] **Step 1: Replace the file**

```tsx
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
```

- [ ] **Step 2: Verify types**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/forms/auth-forms.tsx
git commit -m "fix(auth): use AuthField/AuthMessage in SignInForm/SignUpForm, 44px touch targets"
```

---

## Task 5: Sanitize signUpAction error message

**Files:**
- Modify: `server/actions/auth.ts`

`signUpAction` currently returns `error.message` directly from Supabase, which can leak internal strings like "User already registered". The fix returns a generic message, matching the pattern already used in `signInAction`.

- [ ] **Step 1: Find the leak**

In `server/actions/auth.ts`, locate the `signUpAction` function. Find this block (around line 54):

```ts
  if (error) {
    return { status: "error", message: error.message };
  }
```

- [ ] **Step 2: Replace with sanitized message**

```ts
  if (error) {
    return { status: "error", message: "Something went wrong. Please try again." };
  }
```

- [ ] **Step 3: Verify types**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add server/actions/auth.ts
git commit -m "fix(auth): sanitize signUpAction error — stop leaking Supabase error strings"
```

---

## Task 6: Fix forgot-password page

**Files:**
- Create: `app/(auth)/forgot-password/form.tsx`
- Modify: `app/(auth)/forgot-password/page.tsx`

The page is converted from a `"use client"` component to a **Server Component** so it can read `searchParams` and conditionally render the expired-link error. The form logic is extracted into a separate client component (`form.tsx`).

**Important:** In Next.js 15+/16, `searchParams` in a page component is typed as `Promise<...>` and must be awaited.

- [ ] **Step 1: Create app/(auth)/forgot-password/form.tsx**

```tsx
// app/(auth)/forgot-password/form.tsx
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
```

- [ ] **Step 2: Replace app/(auth)/forgot-password/page.tsx**

Replace the entire file content with:

```tsx
// app/(auth)/forgot-password/page.tsx
import Link from "next/link";
import { AuthMessage } from "@/components/auth/auth-message";
import { ForgotPasswordForm } from "./form";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

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
        {error === "link_expired" && (
          <div style={{ marginBottom: 16 }}>
            <AuthMessage
              state={{
                status: "error",
                message:
                  "That reset link has expired or was already used. Request a new one below.",
              }}
            />
          </div>
        )}
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
```

- [ ] **Step 3: Verify types**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(auth)/forgot-password/form.tsx" "app/(auth)/forgot-password/page.tsx"
git commit -m "fix(auth): handle link_expired error param, extract ForgotPasswordForm to client component"
```

---

## Task 7: Fix reset-password page

**Files:**
- Modify: `app/(auth)/reset-password/page.tsx`

Replace the duplicated inline `<label>/<input>/<button>` markup with `AuthField` and `AuthMessage`. The page stays `"use client"` (no searchParams to read).

- [ ] **Step 1: Replace the file**

```tsx
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
```

- [ ] **Step 2: Verify types**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(auth)/reset-password/page.tsx"
git commit -m "fix(auth): use AuthField/AuthMessage in reset-password, remove duplicated inline form code"
```

---

## Task 8: Final verification

Run all verification commands and confirm the build is green.

- [ ] **Step 1: Type check**

```bash
npm run typecheck
```

Expected: exit 0, no TypeScript errors.

- [ ] **Step 2: Lint**

```bash
npm run lint
```

Expected: exit 0, no ESLint errors or warnings that weren't pre-existing.

- [ ] **Step 3: Build**

The build script runs `validate:env` first. You need `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` set in `.env.local`. If these are not set, the build will fail at the env validation step — set dummy values (`http://localhost` and `dummy-anon-key`) to test the Next.js build step in isolation:

```bash
npm run build
```

Expected: exit 0. The output should include routes for `/(auth)/sign-in`, `/(auth)/sign-up`, `/(auth)/forgot-password`, `/(auth)/reset-password`.

- [ ] **Step 4: Commit any lint auto-fixes, or confirm clean state**

```bash
git status
```

If clean (no uncommitted changes): done.  
If lint applied auto-fixes: `git add -A && git commit -m "fix(auth): apply lint auto-fixes"`.

---

## Acceptance Checklist

After Task 8, verify manually or via browser DevTools:

- [ ] At 320px viewport width: form card is full-width, no horizontal scroll
- [ ] At 390px (mobile): form panel fills the screen, no 45% dead gap
- [ ] At 1024px+: two-column layout visible, left panel with brand/decorative card
- [ ] All inputs have height ≥ 44px
- [ ] Submit buttons have height ≥ 44px
- [ ] Password fields show eye icon; clicking toggles visibility
- [ ] Tab through sign-in form: focus ring visible on each input
- [ ] `/forgot-password?error=link_expired` shows the "expired or already used" banner above the form
- [ ] Submitting the forgot-password form with a valid email shows the muted info message
- [ ] `/sign-up` error message does not contain raw Supabase strings
- [ ] `npm run typecheck`, `npm run lint`, `npm run build` all pass
