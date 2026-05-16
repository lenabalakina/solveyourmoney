# Auth Pages — Responsive, Accessibility & Production Hardening

**Date:** 2026-05-16
**Status:** Approved
**Builds on:** `2026-05-14-auth-pages-redesign-design.md`

## Overview

The auth pages (sign-in, sign-up, forgot-password, reset-password) have a working Supabase flow but several production-blocking issues: a broken two-column layout on mobile, touch targets below 44px, no keyboard focus rings on inputs, duplicated inline form code across pages that cannot share fixes, an unhandled `?error=link_expired` query param, and a Supabase error message leak in `signUpAction`.

This spec covers fixing all Critical and High issues via Approach B: extract shared auth primitives, rewrite `AuthShell` to Tailwind-responsive, and bring all auth pages onto the shared component tree.

## Issues Fixed

| Severity | Issue |
|---|---|
| Critical | `AuthShell` two-column grid renders on mobile — form gets 55% width with 45% dead gap |
| Critical | Input height 36px, button height 32px — below 44px touch target minimum |
| High | `outline: none` on inputs — keyboard focus invisible |
| High | `/forgot-password?error=link_expired` param ignored — user sees blank form, no explanation |
| High | No password visibility toggle — painful on mobile |
| High | `forgot-password` and `reset-password` duplicate `Field` inline styles — can't share fixes |
| High | `signUpAction` returns raw `error.message` from Supabase — leaks internal strings |
| Medium | No `aria-describedby` / `aria-invalid` connecting inputs to error messages |
| Medium | `FormMessage` cannot render `info` variant — "reset link on its way" has no visual distinction |

## Component Architecture

```
components/auth/
  auth-shell.tsx      ← existing, rewritten to Tailwind-responsive (removes inline grid)
  auth-field.tsx      ← NEW: label + input + password toggle + focus ring + aria wiring
  auth-message.tsx    ← NEW: error / info / success message variants

components/forms/
  auth-forms.tsx      ← updated: SignInForm + SignUpForm use AuthField + AuthMessage

app/(auth)/
  layout.tsx                   ← unchanged
  sign-in/page.tsx             ← minor cleanup of stale inline styles
  sign-up/page.tsx             ← minor cleanup of stale inline styles
  forgot-password/page.tsx     ← adopt AuthField + AuthMessage, handle ?error param
  reset-password/page.tsx      ← adopt AuthField + AuthMessage
  callback/route.ts            ← unchanged (Route Handler, stays server-side)
```

## AuthShell — Responsive Layout

### Problem
Inline `style={{ gridTemplateColumns: "45fr 55fr" }}` is not media-query-aware. The CSS class `.auth-left-panel { display: none }` in `globals.css` hides the left panel visually at 767px, but the grid track still exists — the form panel only occupies 55% of the viewport on mobile.

### Fix
Replace inline styles with Tailwind responsive classes:

- **Default (mobile):** `flex flex-col min-h-dvh` on `<main>`. Left panel: `hidden`. Right panel: `flex-1 flex items-center justify-center px-5 py-12`.
- **lg (1024px+):** `grid grid-cols-[45fr_55fr]` on `<main>`. Left panel: `lg:flex`. Right panel layout preserved.

The inner form column becomes `w-full max-w-sm sm:max-w-md` (responsive max-width).

Remove the now-redundant `.auth-left-panel` media-query rule from `globals.css`.

The left panel content (brand headline, decorative card) is unchanged — only its responsive wiring changes.

## AuthField Primitive

New file: `components/auth/auth-field.tsx`. A `"use client"` component (required for password toggle `useState`).

### Props
```ts
interface AuthFieldProps {
  label: string;
  name: string;
  type?: "text" | "email" | "password";
  autoComplete?: string;
  errorId?: string;   // when provided: aria-describedby + aria-invalid="true"
  required?: boolean;
  minLength?: number;
}
```

### Input styles
- Height: `h-11` (44px) — fixes touch target
- Focus ring: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-glow)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-1)]`
- Existing visual styles preserved: `bg-[oklch(1_0_0_/_.04)] rounded-lg shadow-[0_0_0_1px_var(--line)] text-[var(--fg)] px-3 text-[13px] w-full`
- Remove `outline: none`

### Password toggle
When `type="password"`, render a toggle button positioned inside the input's right edge (`absolute right-2 inset-y-0`). The input gets `pr-10` to prevent text overlapping the button.
- Button: `type="button"` (prevents accidental form submit), `w-11 h-11` minimum hit area, `aria-label="Show password"` / `"Hide password"`, renders `Eye` / `EyeOff` from `lucide-react`
- State: `const [visible, setVisible] = useState(false)` — flips between `type="text"` and `type="password"`
- Reduced motion: icon swap has no animation

### Aria wiring
When `errorId` is provided:
```tsx
<input aria-describedby={errorId} aria-invalid="true" ... />
```

## AuthMessage Primitive

New file: `components/auth/auth-message.tsx`. A Server-compatible component (no client hooks needed).

### Props
```ts
interface AuthMessageProps {
  state: AuthFormState;  // { status: "idle" | "error", message: string }
  id?: string;           // for aria-describedby pairing
}
```

### Variants
- **No message** (`state.message` empty): renders nothing
- **`status: "error"`:** `role="alert"` div — `bg-[var(--danger-soft)] text-[var(--danger)]`, `rounded-lg px-3 py-2.5 text-[13px]`
- **`status: "idle"` with message** (info): `role="status"` div — `bg-[var(--bg-2)] text-[var(--fg-soft)]`, same sizing. Used for "reset link is on its way."

No `success` variant is added — `AuthFormState` only has `"idle" | "error"` and extending the type would touch server actions, which are out of scope.

## SubmitButton — Touch Target

`SubmitButton` in `auth-forms.tsx` gets `h-11` (44px height). The `.btn` base class in `globals.css` stays at 32px for dashboard use — the auth submit button overrides via Tailwind `h-11 text-[14px]` to avoid regressing dashboard buttons.

## Forgot-Password — Error Query Param

`app/(auth)/forgot-password/page.tsx` is converted from `"use client"` to a Server Component that wraps an inner client form component.

The page receives `searchParams` (Next.js 16 App Router — passed as a `Promise`, awaited):

```tsx
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  // ...
}
```

When `error === "link_expired"`, render an `AuthMessage` in `error` variant above the form:
> "That reset link has expired or was already used. Request a new one below."

The form itself always renders below the message so the user can immediately re-request.

The inner form (`ForgotPasswordForm`) becomes a `"use client"` component using `useActionState` — same pattern as before, just extracted so the page can be a Server Component.

## signUpAction — Security Fix

`server/actions/auth.ts` line ~`if (error) { return { status: "error", message: error.message } }` inside `signUpAction` currently leaks Supabase internal strings (e.g. "User already registered").

Replace with:
```ts
return { status: "error", message: "Something went wrong. Please try again." };
```

This matches the pattern already used in `signInAction`.

## Pages — Shared Field Adoption

`forgot-password/page.tsx` and `reset-password/page.tsx` currently duplicate the `Field` inline styles verbatim. After this work they import `AuthField` and `AuthMessage` from `components/auth/`. The duplicated inline `<label>/<input>/<button>` markup is removed.

`sign-in/page.tsx` and `sign-up/page.tsx` are minor cleanups: remove hard-coded `style` props that are now handled by the shared components.

## Invariants (Unchanged)

- All Supabase auth flows (sign-in, sign-up, PKCE callback, password reset) are preserved exactly
- Route names (`/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`, `/callback`) are unchanged
- Server actions are unchanged except the `signUpAction` error sanitization
- `callback/route.ts` stays as a Route Handler — no UI added
- No OAuth or social sign-in
- Dark-mode-only design system unchanged
- Left panel decorative content (brand headline, XP card) is unchanged

## Verification

```bash
npm run typecheck
npm run lint
npm run build
```

All three must pass. The build script runs `validate:env` first — set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` before building locally.

## Acceptance Criteria

- No horizontal overflow at 320px viewport width
- Form panel is full-width on mobile (not 55%)
- All inputs and submit buttons have ≥44px height
- Keyboard focus is visible on all inputs
- `/forgot-password?error=link_expired` shows the expired-link message
- Password fields have a working show/hide toggle
- `forgot-password` and `reset-password` use `AuthField` — no duplicated inline field code
- `signUpAction` does not return raw Supabase error strings
- `npm run typecheck`, `npm run lint`, `npm run build` all pass
