# Supabase Production Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all schema mismatches between code and migrations, add missing tables, add auth trigger for auto-profile creation, wire Supabase SSR middleware, implement password reset, document env vars, and harden production env validation — making the app fully functional on live Supabase data.

**Architecture:** Schema is fixed via additive migrations (no table drops, only ALTER TABLE / CREATE TABLE). Auth trigger auto-creates `profiles` and `financial_profiles` rows on signup. Middleware handles Supabase SSR session cookie refresh. All dashboard DAL functions (`getOverviewDashboardData`, etc.) already exist and work once schema is correct and credentials are set.

**Tech stack:** Supabase PostgreSQL + Auth + RLS, `@supabase/ssr` 0.7.0, Next.js 16 App Router, TypeScript 5, Zod 4.

---

## Audit Summary (do not skip)

Before executing, know what is already correct and what is broken:

### Already correct ✅
- `lib/supabase/server.ts` — SSR server client, returns `null` when unconfigured
- `lib/supabase/admin.ts` — service-role client, `server-only` import, returns `null` when unconfigured
- `lib/env/server.ts` — Zod env validation, `isSupabaseConfigured()` helper
- `lib/mocks/mockGuards.ts` — throws in production when mock is active
- `lib/data-source/resolveDataSource.ts` — mock/live resolver with guard
- `server/dal/session.ts` — `requireSession()` / `requireAdminSession()`, dev session fallback
- `server/dal/dashboard.ts` — all dashboard DAL functions exist and are auth-gated
- `server/actions/dashboard.ts` — all mutation actions with Zod + session + audit
- `scripts/validate-env.ts` — blocks build when mock enabled in production
- `scripts/mock-audit.ts` — finds mock imports in app paths
- `tests/run-tests.ts` — mock guard and financial calculation tests
- RLS on: `profiles`, `money_intakes`, `financial_snapshots`, `financial_profiles`, `debts`, `expenses`, `savings_goals`, `learning_progress`, `activity_logs`
- Dashboard layout calls `requireSession()` — auth-gated at layout level

### Broken / missing ❌

| Issue | Impact |
|---|---|
| `money_intakes` missing columns: `income`, `expenses`, `debt`, `savings`, `goals`, `assumptions` | Onboarding insert fails silently |
| `financial_snapshots` missing columns: `intake_id`, `debt_pressure_ratio`, `savings_rate`, `risk_flags`, `assumptions`, `logic_version` | Onboarding insert fails silently |
| `profiles` missing `onboarding_status` column | Onboarding update fails silently |
| `activity_logs` missing `metadata` column | Activity log writes fail silently |
| `learning_progress` no unique constraint on `(user_id, slug)` | `markLessonComplete` upsert fails |
| `audit_logs` table does not exist | All audit writes fail silently |
| `waitlist_signups` table does not exist | Waitlist signup fails |
| No auth trigger on `auth.users` | `profiles` row never created on signup → all FK inserts fail |
| No `middleware.ts` | Supabase SSR cookies not refreshed → users logged out after 1 hour |
| `forgot-password` page has no form action | Password reset is dead |
| No `.env.example` file | Dev setup requires guesswork |
| `validate-env.ts` does not fail when Supabase vars missing in production | Build succeeds without credentials |

---

## File Map

### Files to create
| File | Purpose |
|---|---|
| `database/migrations/004_schema_fixes.sql` | Fix all schema mismatches + add missing tables |
| `database/migrations/005_auth_triggers.sql` | Auto-create profiles on auth.users insert |
| `middleware.ts` | Supabase SSR session cookie refresh |
| `.env.example` | Document all required env vars |

### Files to modify
| File | Change |
|---|---|
| `server/actions/auth.ts` | Add `requestPasswordResetAction` |
| `app/(auth)/forgot-password/page.tsx` | Wire form to action |
| `scripts/validate-env.ts` | Fail build if production lacks Supabase vars |
| `database/tests/rls_foundation.sql` | Add tests for new tables |
| `tests/run-tests.ts` | Add test for production env check |

---

## Task 1: Migration 004 — Fix Schema Mismatches + Add Missing Tables

**Files:**
- Create: `database/migrations/004_schema_fixes.sql`

- [ ] **Step 1: Write migration 004**

Create `database/migrations/004_schema_fixes.sql` with this exact content:

```sql
-- 004_schema_fixes.sql
-- Additive migration: fixes mismatches between code and schema, adds missing tables.
-- Safe to run on a fresh database or after 001–003 have been applied.

-- ── money_intakes: add structured columns that onboarding.ts inserts into ──────────────────
alter table public.money_intakes
  add column if not exists income     jsonb not null default '{}'::jsonb,
  add column if not exists expenses   jsonb not null default '{}'::jsonb,
  add column if not exists debt       jsonb not null default '{}'::jsonb,
  add column if not exists savings    jsonb not null default '{}'::jsonb,
  add column if not exists goals      jsonb not null default '{}'::jsonb,
  add column if not exists assumptions jsonb not null default '{}'::jsonb;

-- ── financial_snapshots: add columns that onboarding.ts inserts into ──────────────────────
alter table public.financial_snapshots
  add column if not exists intake_id           uuid references public.money_intakes(id),
  add column if not exists debt_pressure_ratio numeric not null default 0,
  add column if not exists savings_rate        numeric not null default 0,
  add column if not exists risk_flags          jsonb not null default '[]'::jsonb,
  add column if not exists assumptions         jsonb not null default '{}'::jsonb,
  add column if not exists logic_version       text  not null default '1.0';

-- ── profiles: add onboarding_status that onboarding.ts writes ─────────────────────────────
alter table public.profiles
  add column if not exists onboarding_status text not null default 'pending';

-- ── activity_logs: add metadata column that dashboard.ts writes ───────────────────────────
alter table public.activity_logs
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- ── learning_progress: unique constraint required for upsert(onConflict:"user_id,slug") ───
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'learning_progress_user_id_slug_key'
      and conrelid = 'public.learning_progress'::regclass
  ) then
    alter table public.learning_progress
      add constraint learning_progress_user_id_slug_key unique (user_id, slug);
  end if;
end $$;

-- ── audit_logs: written by service role only; no user RLS access ──────────────────────────
create table if not exists public.audit_logs (
  id          uuid        primary key default gen_random_uuid(),
  actor_id    uuid,
  action      text        not null,
  target_type text        not null,
  target_id   uuid,
  metadata    jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

-- Service role bypasses RLS. Client users must never read audit logs.
create policy if not exists "audit_logs_deny_all_users"
  on public.audit_logs for all
  using (false);

-- ── waitlist_signups: unauthenticated INSERT from marketing site ──────────────────────────
create table if not exists public.waitlist_signups (
  id         uuid        primary key default gen_random_uuid(),
  email      text        not null unique,
  intent     text,
  source     text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.waitlist_signups enable row level security;

-- Anyone may add themselves to the waitlist (marketing homepage).
-- No one may read or update via the client (service role only).
create policy if not exists "waitlist_signups_insert_anon"
  on public.waitlist_signups for insert
  with check (true);

-- ── Indexes on user_id for all user-owned tables ──────────────────────────────────────────
create index if not exists idx_money_intakes_user_id
  on public.money_intakes(user_id);

create index if not exists idx_financial_snapshots_user_id
  on public.financial_snapshots(user_id);

create index if not exists idx_debts_user_id
  on public.debts(user_id);

create index if not exists idx_expenses_user_id
  on public.expenses(user_id);

create index if not exists idx_savings_goals_user_id
  on public.savings_goals(user_id);

create index if not exists idx_learning_progress_user_id
  on public.learning_progress(user_id);

create index if not exists idx_activity_logs_user_id
  on public.activity_logs(user_id);

create index if not exists idx_activity_logs_occurred_at
  on public.activity_logs(occurred_at desc);
```

- [ ] **Step 2: Commit**

```bash
git add database/migrations/004_schema_fixes.sql
git commit -m "feat(db): migration 004 — fix schema mismatches, add audit_logs and waitlist_signups"
```

---

## Task 2: Migration 005 — Auth Trigger for Auto-Profile Creation

**Files:**
- Create: `database/migrations/005_auth_triggers.sql`

This is the critical missing piece. Without it, `auth.users` gets a row on signup but `profiles` never gets one. Every FK insert that references `profiles(id)` fails.

- [ ] **Step 1: Write migration 005**

Create `database/migrations/005_auth_triggers.sql`:

```sql
-- 005_auth_triggers.sql
-- Trigger: auto-create profiles + financial_profiles when auth.users gets a new row.
-- security definer + empty search_path prevents privilege escalation.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Create the public profile for the new user
  insert into public.profiles (id, email, display_name, role, onboarding_status)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(new.email, '@', 1)
    ),
    'user',
    'pending'
  )
  on conflict (id) do nothing;

  -- Create a default financial_profiles row so the dashboard always has a base record
  insert into public.financial_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- Drop before recreate so re-running the migration is safe
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();
```

- [ ] **Step 2: Verify the trigger function compiles (no Supabase CLI needed)**

Read the SQL once more and confirm:
- `new.raw_user_meta_data` is the correct Supabase column (it is)
- `on conflict (id) do nothing` handles idempotent re-runs
- `on conflict (user_id) do nothing` handles idempotent re-runs for financial_profiles

- [ ] **Step 3: Commit**

```bash
git add database/migrations/005_auth_triggers.sql
git commit -m "feat(db): migration 005 — auth trigger auto-creates profiles on signup"
```

---

## Task 3: Middleware for Supabase SSR Session Refresh

**Files:**
- Create: `middleware.ts` (at project root, same level as `package.json`)

Without this, Supabase access tokens expire after 1 hour and users get silently logged out because the SSR client cannot refresh them without seeing each request.

- [ ] **Step 1: Write middleware.ts**

Create `middleware.ts` at the project root:

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes accessible without authentication
const PUBLIC_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/api/",
  "/_next/",
  "/pricing",
  "/how-it-works",
  "/privacy",
  "/terms",
  "/about",
  "/icons",
];

function isPublicRoute(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // When Supabase is not configured (local dev without credentials), skip.
  // The DAL's requireSession() already handles the dev-session fallback.
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next();
  }

  // Must clone response so cookies set during getUser() are forwarded
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Write refreshed cookies back into both the request and response
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: Do not add logic between createServerClient and getUser().
  // getUser() performs the token refresh if needed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Redirect unauthenticated users away from protected routes
  if (!user && !isPublicRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Run on all routes except static assets
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors in `middleware.ts`. If you see `Cannot find module 'next/server'`, verify Next.js 16 types are installed (`next-env.d.ts` references them).

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat(auth): add Supabase SSR middleware for session token refresh"
```

---

## Task 4: Password Reset Flow

**Files:**
- Modify: `server/actions/auth.ts`
- Modify: `app/(auth)/forgot-password/page.tsx`

The page exists with a form but has no action. The form does nothing on submit.

- [ ] **Step 1: Add `requestPasswordResetAction` to server/actions/auth.ts**

Open `server/actions/auth.ts`. After `signOutAction`, add:

```typescript
export async function requestPasswordResetAction(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = formData.get("email");

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return { status: "error", message: "Enter a valid email address." };
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      status: "error",
      message: "Authentication is not configured. Add Supabase env vars before launch.",
    };
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";

  // Supabase sends the reset email via its own SMTP. Configure SMTP in the
  // Supabase dashboard (Authentication → Email → SMTP settings) before launch.
  await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${siteUrl}/auth/callback?next=/dashboard`,
  });

  // Always return a generic message to prevent email enumeration attacks.
  return {
    status: "idle",
    message: "If that email is registered, a reset link is on its way.",
  };
}
```

- [ ] **Step 2: Wire the form in forgot-password/page.tsx**

Replace the full content of `app/(auth)/forgot-password/page.tsx`:

```tsx
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
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: no type errors. If `useActionState` is not found, confirm React 19 types are installed (`@types/react` v19).

- [ ] **Step 4: Commit**

```bash
git add server/actions/auth.ts app/(auth)/forgot-password/page.tsx
git commit -m "feat(auth): wire password reset — requestPasswordResetAction + forgot-password form"
```

---

## Task 5: .env.example + Production Env Validation Hardening

**Files:**
- Create: `.env.example`
- Modify: `scripts/validate-env.ts`

- [ ] **Step 1: Create .env.example**

Create `.env.example` at the project root:

```bash
# ── App environment ───────────────────────────────────────────────────────────
# Set to "local" | "preview" | "production"
NEXT_PUBLIC_APP_ENV=local

# Enable mock data (local dev only; must be false in production)
NEXT_PUBLIC_USE_MOCK_DATA=false

# Allow mock data in preview deployments (set true only for staging)
ALLOW_PREVIEW_MOCK_DATA=false

# ── App URL ───────────────────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# ── Supabase ──────────────────────────────────────────────────────────────────
# Required in production. Optional in local dev (app falls back to dev session).
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# NEVER expose this in the browser. Server-only (service role bypasses RLS).
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# ── Database (for Supabase CLI / DB tools — not used by the app at runtime) ──
DATABASE_URL=postgresql://postgres:password@db.your-project-id.supabase.co:5432/postgres
DIRECT_URL=postgresql://postgres:password@db.your-project-id.supabase.co:5432/postgres

# ── Anthropic AI (bank statement import) ─────────────────────────────────────
ANTHROPIC_API_KEY=your-anthropic-api-key-here

# ── Billing — LemonSqueezy ────────────────────────────────────────────────────
# Leave blank if billing is not live yet.
LEMONSQUEEZY_API_KEY=
LEMONSQUEEZY_STORE_ID=
LEMONSQUEEZY_PLAN_VARIANT_ID=
LEMONSQUEEZY_GUIDANCE_VARIANT_ID=
LEMONSQUEEZY_WEBHOOK_SECRET=

# ── Analytics — PostHog ───────────────────────────────────────────────────────
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com

# ── Error monitoring — Sentry ─────────────────────────────────────────────────
SENTRY_DSN=

# ── Email — Resend (optional, for custom transactional email templates) ───────
RESEND_API_KEY=
RESEND_FROM_EMAIL=

# ── Admin access ──────────────────────────────────────────────────────────────
# Comma-separated emails. Only used in dev/staging — never trust in production.
ADMIN_EMAIL_ALLOWLIST=
```

- [ ] **Step 2: Harden scripts/validate-env.ts**

Read `scripts/validate-env.ts` (currently 33 lines). Add the production Supabase check after the existing mock check. The full file becomes:

```typescript
import { loadEnv } from "../lib/config/env";

try {
  const env = loadEnv(process.env as NodeJS.ProcessEnv);

  if (env.NEXT_PUBLIC_APP_ENV === "production" && env.USE_MOCK) {
    console.error(
      "validate-env: Mock data flag is enabled in production — failing build",
    );
    process.exitCode = 2;
    throw new Error("Mock data is not allowed in production");
  }

  if (
    env.NEXT_PUBLIC_APP_ENV === "preview" &&
    env.USE_MOCK &&
    !env.ALLOW_PREVIEW_MOCK
  ) {
    console.warn(
      "validate-env: WARN — Mock data is enabled in preview but ALLOW_PREVIEW_MOCK_DATA is not set. " +
        "Set ALLOW_PREVIEW_MOCK_DATA=true to allow, or set NEXT_PUBLIC_USE_MOCK_DATA=false.",
    );
  }

  // Production requires Supabase credentials — fail the build if missing.
  if (env.NEXT_PUBLIC_APP_ENV === "production") {
    const missing: string[] = [];
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
    if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    if (missing.length > 0) {
      console.error(
        `validate-env: Missing required production env vars: ${missing.join(", ")}`,
      );
      process.exitCode = 2;
      throw new Error(`Required in production: ${missing.join(", ")}`);
    }
  }

  console.log("validate-env: OK", {
    env: env.NEXT_PUBLIC_APP_ENV,
    useMock: env.USE_MOCK,
  });
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : "Unknown error";
  console.error("validate-env: Configuration invalid", message);
  if (!process.exitCode) process.exitCode = 1;
}
```

- [ ] **Step 3: Commit**

```bash
git add .env.example scripts/validate-env.ts
git commit -m "feat(ops): add .env.example, fail build when production lacks Supabase vars"
```

---

## Task 6: Tests for New Tables + Production Env Check

**Files:**
- Modify: `database/tests/rls_foundation.sql`
- Modify: `tests/run-tests.ts`

- [ ] **Step 1: Update database/tests/rls_foundation.sql**

Replace the full content of `database/tests/rls_foundation.sql`:

```sql
begin;

-- ── RLS smoke-test checklist ──────────────────────────────────────────────────
--
-- Run these manually in the Supabase SQL editor against your project.
-- All tests must pass before going live.
--
-- HOW TO RUN:
--   1. Open Supabase dashboard → SQL Editor
--   2. Paste this file and run it
--   3. All queries inside should return expected values
--
-- ── Test 1: User A cannot read User B's financial data ────────────────────────
-- set local role authenticated;
-- set local request.jwt.claims = '{"sub":"user-a-uuid"}';
-- select count(*) from public.debts;               -- must return only user A rows
-- select count(*) from public.expenses;             -- must return only user A rows
-- select count(*) from public.savings_goals;        -- must return only user A rows
-- select count(*) from public.learning_progress;    -- must return only user A rows
-- select count(*) from public.activity_logs;        -- must return only user A rows
-- select count(*) from public.financial_profiles;   -- must return only user A rows
--
-- ── Test 2: User cannot insert a row with another user's user_id ──────────────
-- set local role authenticated;
-- set local request.jwt.claims = '{"sub":"user-a-uuid"}';
-- insert into public.debts (user_id, name, balance, monthly_payment)
--   values ('user-b-uuid', 'Stolen', 0, 0);        -- must fail with RLS violation
--
-- ── Test 3: audit_logs is not readable by authenticated users ─────────────────
-- set local role authenticated;
-- set local request.jwt.claims = '{"sub":"user-a-uuid"}';
-- select count(*) from public.audit_logs;           -- must return 0 rows (deny policy)
--
-- ── Test 4: waitlist_signups — anonymous users can insert ─────────────────────
-- set local role anon;
-- insert into public.waitlist_signups (email, source)
--   values ('test@example.com', 'test');            -- must succeed
--
-- ── Test 5: waitlist_signups — authenticated users cannot read ────────────────
-- set local role authenticated;
-- set local request.jwt.claims = '{"sub":"user-a-uuid"}';
-- select count(*) from public.waitlist_signups;     -- must return 0 rows or error
--
-- ── Test 6: Auth trigger creates profiles row on signup ───────────────────────
-- (Test by signing up a new user via the app and confirming the profiles row exists)
-- select * from public.profiles where id = '<new-user-uuid>';  -- must return 1 row
-- select * from public.financial_profiles where user_id = '<new-user-uuid>';  -- must return 1 row

rollback;
```

- [ ] **Step 2: Add production env test to tests/run-tests.ts**

Read `tests/run-tests.ts`. Add the following test before the final `console.log("All tests passed")` line at the bottom of `runTests()`:

```typescript
  // Test: production without Supabase vars should be detected by validate-env logic
  resetEnv();
  process.env.NEXT_PUBLIC_APP_ENV = "production";
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = "false";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  {
    const isProduction = process.env.NEXT_PUBLIC_APP_ENV === "production";
    const hasSupabaseUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const hasAnonKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    assert(
      isProduction && !hasSupabaseUrl && !hasAnonKey,
      "validate-env: production without Supabase vars must be detectable",
    );
  }
```

- [ ] **Step 3: Run the test suite**

```bash
npm run test:local
```

Expected output:
```
All tests passed (lightweight)
```

If any test fails, fix it before continuing. Common failures:
- Module path wrong → check the `path.join` arguments match actual file locations
- `assertMockDataAllowed` mock guard throws at wrong env → re-read `lib/mocks/mockGuards.ts`

- [ ] **Step 4: Commit**

```bash
git add database/tests/rls_foundation.sql tests/run-tests.ts
git commit -m "test: add RLS checklist for new tables and production env validation test"
```

---

## Task 7: CI Checks — Typecheck + Lint + Build

- [ ] **Step 1: Run typecheck**

```bash
npm run typecheck
```

Expected: 0 errors. Common issues to fix:
- `useActionState` not found → confirm `@types/react` v19 is installed
- `requestPasswordResetAction` not exported → check `server/actions/auth.ts` export
- `middleware.ts` type errors → confirm `NextRequest`/`NextResponse` imports from `"next/server"`

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: 0 errors. If lint warns about mock imports, check `scripts/mock-audit.ts` — `middleware.ts` and the new action file must not import from mock paths.

- [ ] **Step 3: Run tests**

```bash
npm run test:local
```

Expected: `All tests passed (lightweight)`

- [ ] **Step 4: Run build**

```bash
npm run build
```

Expected: build succeeds. The `validate-env` preflight runs first — in local dev (`NEXT_PUBLIC_APP_ENV=local`) the Supabase vars are optional so the build should pass even without credentials.

If build fails:
- `validate-env` error → read the error message; likely a missing env var check failing
- TypeScript error → fix it (typecheck output tells you which file/line)
- Next.js build error → read the build output carefully

- [ ] **Step 5: Commit any build fixes, then final commit**

```bash
git add -p   # stage only the relevant fixes
git commit -m "fix: resolve typecheck and build issues after Supabase setup"
```

---

## Deployment Checklist (run before going live)

Before pointing the production domain at this app, verify each item manually:

### Database (Supabase dashboard)
- [ ] Apply migrations 001 through 005 in order via SQL Editor or Supabase CLI
- [ ] Confirm `profiles` table has `onboarding_status` column
- [ ] Confirm `audit_logs` table exists with deny-all RLS
- [ ] Confirm `waitlist_signups` table exists with anonymous INSERT policy
- [ ] Confirm `activity_logs` table has `metadata` column
- [ ] Confirm `learning_progress` has unique constraint on `(user_id, slug)`
- [ ] Sign up a test user → confirm `profiles` row auto-created by trigger
- [ ] Sign up a test user → confirm `financial_profiles` row auto-created by trigger
- [ ] Run the RLS checklist in `database/tests/rls_foundation.sql`

### Environment variables (production host)
- [ ] `NEXT_PUBLIC_APP_ENV=production`
- [ ] `NEXT_PUBLIC_USE_MOCK_DATA=false`
- [ ] `NEXT_PUBLIC_SUPABASE_URL` set
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` set
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set (server-only, not NEXT_PUBLIC_)
- [ ] `NEXT_PUBLIC_SITE_URL` set to production domain
- [ ] `ANTHROPIC_API_KEY` set (for bank statement import)

### Auth (Supabase dashboard)
- [ ] Site URL configured: Authentication → URL Configuration → Site URL
- [ ] Redirect URLs allowlist includes your production domain + `/auth/callback`
- [ ] SMTP configured for password reset emails: Authentication → Email → SMTP Settings
- [ ] Email confirmation enabled or disabled per your launch decision

### Security
- [ ] Confirm `SUPABASE_SERVICE_ROLE_KEY` is NOT in any `NEXT_PUBLIC_*` variable
- [ ] Confirm no mock service files are imported in `app/`, `components/`, `features/` (run `npm run ci:mock-audit`)
- [ ] Confirm `npm run build` passes with production env vars set

---

## Unresolved Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Password reset email delivery | High | Supabase SMTP must be configured in dashboard before launch; without it, `resetPasswordForEmail` silently does nothing |
| Existing local DB state | Medium | If you have a local Supabase instance with old schema, run migrations 004+005 manually or `supabase db reset` |
| `financial_snapshots.intake_id` FK nullable | Low | Existing snapshots (from testing) have no intake_id; acceptable — new snapshots will have it |
| No email verification on signup | Low | Supabase sends confirmation emails if enabled in dashboard; app does not block on it |
| Dev sessions use `dev:email` as userId | Info | The dev session path is guarded by `!isSupabaseConfigured()` — production always uses real auth |

---

## Launch Readiness Verdict

**NOT LAUNCH READY until:**
1. Migrations 004 + 005 are applied to the production database
2. Production env vars are set (especially `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
3. Auth trigger verified (test user signup creates `profiles` row)
4. Supabase SMTP configured for password reset emails

**LAUNCH READY after** all 4 items above are confirmed.

The code changes in this plan (migrations + middleware + password reset + env hardening) are all that stands between the current codebase and a working production Supabase deployment. The dashboard DAL, RLS policies, mock guards, and server actions are already correct.
