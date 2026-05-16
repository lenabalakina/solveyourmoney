# SolveYourMoney MVP Launch Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all production mock data from notifications and import pages, standardize EUR currency, add import session tracking + detail page, enhance the savings goal form with full fields, and add tests covering all critical paths.

**Architecture:** Every page that currently embeds hardcoded SEED data is converted to a server component that fetches real data and passes it as props to its client component. Import sessions are tracked in a new `import_sessions` Supabase table. Notifications are derived from the existing `activity_logs` table. All components follow the existing dual-service pattern (live + mock) with `resolveDataSource()`.

**Tech Stack:** Next.js 16 App Router, Supabase JS v2, Zod v4, TypeScript, React 19, existing `resolveDataSource` / `assertMockDataAllowed` / `requireSession` patterns.

---

## Audit Summary

### Real Mock Data Violations

| File | Issue |
|------|-------|
| `app/(dashboard)/dashboard/notifications/notifications-content.tsx` | Hardcoded `SEED` array (9 fake notifications with `$` amounts). No live service. |
| `app/(dashboard)/dashboard/import/import-content.tsx` | Hardcoded `SEED_FILES` (5 fake imports). Hardcoded metrics. Dollar sign `$${fmt(tx.amount)}` in ParsePreview. |

### Currency Violations

| File | Issue |
|------|-------|
| `lib/format.ts` | Uses `en-US` locale — should be `nl-NL` for EUR |
| `components/dashboard/savings-goal-form.tsx` | `placeholder="Target $"` |
| `import-content.tsx` ParsePreview | `$${fmt(tx.amount)}` — hardcoded `$` prefix |
| `notifications-content.tsx` SEED | Dollar amounts in body strings (removed with SEED) |

### Missing Features

| Feature | Status |
|---------|--------|
| `/dashboard/import/[importId]` detail page | Missing entirely |
| `import_sessions` DB table | Missing — no import history tracking |
| Savings goal: currentAmount, monthlyContribution, targetDate fields | Schema has them in DB but form/action/schema don't expose them |

### Dead UI

| Element | Location |
|---------|----------|
| "Browse history" button | `import-content.tsx` header — no action |
| "Open full review" button | `import-content.tsx` ParsePreview — disabled, no handler |

---

## File Structure

### New Files
- `database/migrations/006_import_sessions.sql`
- `features/imports/services/importsSchema.ts`
- `features/imports/services/importsLiveService.ts`
- `features/imports/services/importsMockService.ts`
- `features/imports/services/importsService.ts`
- `features/notifications/services/notificationsSchema.ts`
- `features/notifications/services/notificationsLiveService.ts`
- `features/notifications/services/notificationsMockService.ts`
- `features/notifications/services/notificationsService.ts`
- `server/actions/importSession.ts`
- `app/(dashboard)/dashboard/import/[importId]/page.tsx`
- `app/(dashboard)/dashboard/import/[importId]/loading.tsx`

### Modified Files
- `lib/format.ts` — locale `en-US` → `nl-NL`
- `lib/validation/forms.ts` — extend `savingsGoalSchema`
- `server/actions/dashboard.ts` — extend `createSavingsGoal`
- `server/actions/import.ts` — record import session, return `importSessionId`
- `components/dashboard/savings-goal-form.tsx` — add fields, fix `$` placeholder
- `app/(dashboard)/dashboard/import/page.tsx` — make async, fetch history + metrics
- `app/(dashboard)/dashboard/import/import-content.tsx` — remove SEED, accept props, fix `$` sign, remove dead "Open full review" button
- `app/(dashboard)/dashboard/notifications/page.tsx` — make async, fetch notifications
- `app/(dashboard)/dashboard/notifications/notifications-content.tsx` — remove SEED, accept props
- `tests/run-tests.ts` — add new test cases

---

## Task 1: Fix EUR Currency Locale in `lib/format.ts`

**Files:**
- Modify: `lib/format.ts`

- [ ] **Step 1: Write failing test first**

Add to `tests/run-tests.ts` (paste this block before the final `console.log` line):

```typescript
  // Test: formatCurrency uses EUR locale, not USD
  {
    const fmt = requireFresh(path.join(__dirname, "..", "lib", "format.ts"));
    const result = fmt.formatCurrency(1234);
    assert(!result.includes("$"), `formatCurrency must not produce dollar sign, got: ${result}`);
    assert(result.includes("1.234") || result.includes("1,234"), `formatCurrency must format 1234, got: ${result}`);
  }
```

- [ ] **Step 2: Run test to see it fail**

```bash
npx tsx tests/run-tests.ts
```

Expected: FAIL — `"formatCurrency must not produce dollar sign"` (because current locale is `en-US` which can output `€1,234` but let's confirm)

Actually `en-US` with `currency: EUR` outputs `€1,234` not `$1,234`. So this test might pass. The real issue is the locale format convention. Proceed to fix anyway for correctness.

- [ ] **Step 3: Update `lib/format.ts`**

```typescript
export function formatCurrency(value: number) {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatSignedCurrency(value: number) {
  if (value === 0) {
    return formatCurrency(0);
  }

  return `${value > 0 ? "+" : "-"}${formatCurrency(Math.abs(value))}`;
}

export function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

export function formatMonthCount(value: number | null) {
  if (!value) {
    return "Needs data";
  }

  if (value === 1) {
    return "1 month";
  }

  return `${value} months`;
}

export function formatDateLabel(value: string) {
  if (value === "Completed") {
    return value;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "No date yet";
  }

  return new Intl.DateTimeFormat("nl-NL", {
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatRelativeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  return new Intl.DateTimeFormat("nl-NL", {
    month: "short",
    day: "numeric",
  }).format(date);
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx tsx tests/run-tests.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/format.ts tests/run-tests.ts
git commit -m "fix(currency): use nl-NL locale for EUR formatting throughout"
```

---

## Task 2: Fix `$` Placeholder in Savings Goal Form

**Files:**
- Modify: `components/dashboard/savings-goal-form.tsx` (placeholder only — full form update in Task 11)

- [ ] **Step 1: Open `components/dashboard/savings-goal-form.tsx` and change line 62**

Find:
```tsx
placeholder="Target $"
```

Replace with:
```tsx
placeholder="Target (€)"
```

- [ ] **Step 2: Run typecheck to confirm no issues**

```bash
npx tsc --noEmit
```

Expected: No errors related to this change.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/savings-goal-form.tsx
git commit -m "fix(currency): remove dollar sign from savings goal placeholder"
```

---

## Task 3: Add `import_sessions` Database Migration

**Files:**
- Create: `database/migrations/006_import_sessions.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 006_import_sessions.sql
-- Tracks metadata for each bank statement import.
-- Each row is one upload/import event, not individual transactions.

create table if not exists public.import_sessions (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references public.profiles(id) on delete cascade,
  filename         text        not null,
  source_type      text        not null default 'CSV',
  transaction_count int        not null default 0,
  saved_count      int         not null default 0,
  duplicate_count  int         not null default 0,
  status           text        not null default 'complete'
                               check (status in ('complete', 'partial', 'failed')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.import_sessions enable row level security;

create policy if not exists "import_sessions_all_own"
  on public.import_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_import_sessions_user_id
  on public.import_sessions(user_id);

create index if not exists idx_import_sessions_created_at
  on public.import_sessions(created_at desc);
```

- [ ] **Step 2: Apply the migration to your Supabase project**

Run in Supabase SQL editor or via CLI:
```bash
# Via Supabase CLI (if configured):
supabase db push
# Or paste the contents of 006_import_sessions.sql into the Supabase SQL editor and run it.
```

- [ ] **Step 3: Commit the migration file**

```bash
git add database/migrations/006_import_sessions.sql
git commit -m "feat(db): add import_sessions table with RLS"
```

---

## Task 4: Update `saveImportedTransactions` to Record Import Sessions

**Files:**
- Modify: `server/actions/import.ts`

- [ ] **Step 1: Open `server/actions/import.ts` and update the `SaveResult` type and the function**

Replace the entire file with:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/dal/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const assignedTransactionSchema = z.object({
  date: z.string(),
  description: z.string(),
  amount: z.number().positive(),
  type: z.enum(["credit", "debit"]),
  assignment: z.enum(["debt_payment", "expense", "savings", "ignore"]),
  targetId: z.string().optional(),
  targetLabel: z.string().optional(),
});

const saveImportSchema = z.object({
  transactions: z.array(assignedTransactionSchema),
  filename: z.string().optional(),
  sourceType: z.string().optional(),
});

type SaveResult =
  | { ok: true; count: number; duplicates: number; importSessionId: string }
  | { ok: false; message: string };

export async function saveImportedTransactions(
  input: unknown,
): Promise<SaveResult> {
  const session = await requireSession();

  const parsed = saveImportSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Transaction data is not valid." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Data storage is not configured yet." };
  }

  const toSave = parsed.data.transactions.filter(
    (t) => t.assignment !== "ignore",
  );
  let savedCount = 0;
  let duplicateCount = 0;

  for (const tx of toSave) {
    if (tx.assignment === "expense") {
      const today = new Date();
      const periodStart = new Date(today.getFullYear(), today.getMonth(), 1)
        .toISOString()
        .split("T")[0];

      if (tx.targetId) {
        await supabase
          .from("expenses")
          .update({
            actual_amount: tx.amount,
            updated_at: new Date().toISOString(),
          })
          .eq("id", tx.targetId)
          .eq("user_id", session.userId);
        savedCount++;
      } else {
        const { data: dup } = await supabase
          .from("expenses")
          .select("id")
          .eq("user_id", session.userId)
          .eq("category", tx.targetLabel ?? tx.description)
          .eq("actual_amount", tx.amount)
          .eq("period_start", periodStart)
          .maybeSingle();

        if (dup) {
          duplicateCount++;
          continue;
        }

        await supabase.from("expenses").insert({
          user_id: session.userId,
          category: tx.targetLabel ?? tx.description,
          period_start: periodStart,
          planned_amount: tx.amount,
          actual_amount: tx.amount,
        });
        savedCount++;
      }
    } else if (tx.assignment === "debt_payment" && tx.targetId) {
      const { data: debt } = await supabase
        .from("debts")
        .select("balance")
        .eq("id", tx.targetId)
        .eq("user_id", session.userId)
        .maybeSingle();

      if (debt) {
        await supabase
          .from("debts")
          .update({
            balance: Math.max(0, Number(debt.balance) - tx.amount),
            updated_at: new Date().toISOString(),
          })
          .eq("id", tx.targetId)
          .eq("user_id", session.userId);
        savedCount++;
      }
    } else if (tx.assignment === "savings" && tx.targetId) {
      const { data: goal } = await supabase
        .from("savings_goals")
        .select("saved_amount")
        .eq("id", tx.targetId)
        .eq("user_id", session.userId)
        .maybeSingle();

      if (goal) {
        await supabase
          .from("savings_goals")
          .update({
            saved_amount: Number(goal.saved_amount) + tx.amount,
            updated_at: new Date().toISOString(),
          })
          .eq("id", tx.targetId)
          .eq("user_id", session.userId);
        savedCount++;
      }
    }
  }

  // Record the import session for history tracking
  const filename = parsed.data.filename ?? "upload";
  const sourceType = parsed.data.sourceType ?? "CSV";
  const totalCount = parsed.data.transactions.length;
  const status = savedCount > 0 ? "complete" : (totalCount > 0 ? "partial" : "complete");

  const { data: importSession } = await supabase
    .from("import_sessions")
    .insert({
      user_id: session.userId,
      filename,
      source_type: sourceType,
      transaction_count: totalCount,
      saved_count: savedCount,
      duplicate_count: duplicateCount,
      status,
    })
    .select("id")
    .single();

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/debt");
  revalidatePath("/dashboard/budget");
  revalidatePath("/dashboard/savings");
  revalidatePath("/dashboard/import");

  return {
    ok: true,
    count: savedCount,
    duplicates: duplicateCount,
    importSessionId: importSession?.id ?? "",
  };
}
```

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add server/actions/import.ts
git commit -m "feat(imports): record import session on saveImportedTransactions"
```

---

## Task 5: Create Imports Feature Service

**Files:**
- Create: `features/imports/services/importsSchema.ts`
- Create: `features/imports/services/importsLiveService.ts`
- Create: `features/imports/services/importsMockService.ts`
- Create: `features/imports/services/importsService.ts`

- [ ] **Step 1: Write the failing test for imports schema**

Add to `tests/run-tests.ts` (before final `console.log`):

```typescript
  // Test: imports schema validates correctly
  {
    resetEnv();
    process.env.NEXT_PUBLIC_APP_ENV = "local";
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = "true";
    const mock = requireFresh(
      path.join(__dirname, "..", "features", "imports", "services", "importsMockService.ts"),
    );
    const schema = requireFresh(
      path.join(__dirname, "..", "features", "imports", "services", "importsSchema.ts"),
    );
    const result = mock.getImports({ userId: "user-1" });
    schema.ImportsResponseSchema.parse(result);
    assert(Array.isArray(result.sessions), "imports mock: sessions is array");

    const detail = mock.getImportDetail({ userId: "user-1", importId: result.sessions[0]?.id ?? "x" });
    if (detail) {
      schema.ImportSessionSchema.parse(detail);
    }
  }
```

- [ ] **Step 2: Run test to confirm it fails** (files don't exist yet)

```bash
npx tsx tests/run-tests.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `features/imports/services/importsSchema.ts`**

```typescript
import { z } from "zod";

export const ImportSessionSchema = z.object({
  id: z.string(),
  filename: z.string(),
  sourceType: z.string(),
  transactionCount: z.number(),
  savedCount: z.number(),
  duplicateCount: z.number(),
  status: z.enum(["complete", "partial", "failed"]),
  createdAt: z.string(),
});

export const ImportsResponseSchema = z.object({
  userId: z.string(),
  sessions: z.array(ImportSessionSchema),
  timestamp: z.string(),
});

export type ImportSession = z.infer<typeof ImportSessionSchema>;
export type ImportsResponse = z.infer<typeof ImportsResponseSchema>;
```

- [ ] **Step 4: Create `features/imports/services/importsMockService.ts`**

```typescript
import { assertMockDataAllowed } from "@/lib/mocks/mockGuards";
import { ImportsResponseSchema, ImportSessionSchema } from "./importsSchema";
import type { ImportsResponse, ImportSession } from "./importsSchema";

const MOCK_SESSIONS: ImportSession[] = [
  {
    id: "mock-imp-1",
    filename: "ING_Statement_May-2026.csv",
    sourceType: "CSV",
    transactionCount: 48,
    savedCount: 46,
    duplicateCount: 2,
    status: "complete",
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "mock-imp-2",
    filename: "ABN_AMRO_Apr-2026.csv",
    sourceType: "CSV",
    transactionCount: 31,
    savedCount: 31,
    duplicateCount: 0,
    status: "complete",
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
];

export function getImports({ userId }: { userId: string }): ImportsResponse {
  assertMockDataAllowed("imports");
  return ImportsResponseSchema.parse({
    userId,
    sessions: MOCK_SESSIONS,
    timestamp: new Date().toISOString(),
  });
}

export function getImportDetail({
  userId,
  importId,
}: {
  userId: string;
  importId: string;
}): ImportSession | null {
  assertMockDataAllowed("imports");
  void userId;
  return MOCK_SESSIONS.find((s) => s.id === importId) ?? null;
}
```

- [ ] **Step 5: Create `features/imports/services/importsLiveService.ts`**

```typescript
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ImportsResponseSchema, ImportSessionSchema } from "./importsSchema";
import type { ImportsResponse, ImportSession } from "./importsSchema";

export async function getImports({
  userId,
}: {
  userId: string;
}): Promise<ImportsResponse> {
  const now = new Date().toISOString();
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return ImportsResponseSchema.parse({ userId, sessions: [], timestamp: now });
  }

  const { data, error } = await supabase
    .from("import_sessions")
    .select(
      "id, filename, source_type, transaction_count, saved_count, duplicate_count, status, created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data) {
    return ImportsResponseSchema.parse({ userId, sessions: [], timestamp: now });
  }

  const sessions = data.map((row) =>
    ImportSessionSchema.parse({
      id: row.id,
      filename: row.filename,
      sourceType: row.source_type,
      transactionCount: Number(row.transaction_count),
      savedCount: Number(row.saved_count),
      duplicateCount: Number(row.duplicate_count),
      status: row.status,
      createdAt: row.created_at,
    }),
  );

  return ImportsResponseSchema.parse({ userId, sessions, timestamp: now });
}

export async function getImportDetail({
  userId,
  importId,
}: {
  userId: string;
  importId: string;
}): Promise<ImportSession | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("import_sessions")
    .select(
      "id, filename, source_type, transaction_count, saved_count, duplicate_count, status, created_at",
    )
    .eq("id", importId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;

  return ImportSessionSchema.parse({
    id: data.id,
    filename: data.filename,
    sourceType: data.source_type,
    transactionCount: Number(data.transaction_count),
    savedCount: Number(data.saved_count),
    duplicateCount: Number(data.duplicate_count),
    status: data.status,
    createdAt: data.created_at,
  });
}
```

- [ ] **Step 6: Create `features/imports/services/importsService.ts`**

```typescript
import { resolveDataSource } from "@/lib/data-source/resolveDataSource";
import * as mockService from "./importsMockService";
import * as liveService from "./importsLiveService";
import type { ImportsResponse, ImportSession } from "./importsSchema";

type ImportsDataService = {
  getImports: (opts: { userId: string }) => ImportsResponse | Promise<ImportsResponse>;
  getImportDetail: (opts: { userId: string; importId: string }) => ImportSession | null | Promise<ImportSession | null>;
};

const service = resolveDataSource<ImportsDataService>({
  featureName: "imports",
  mockService,
  liveService,
});

export function getImports(opts: { userId: string }) {
  return service.getImports(opts);
}

export function getImportDetail(opts: { userId: string; importId: string }) {
  return service.getImportDetail(opts);
}
```

- [ ] **Step 7: Run test to confirm it passes**

```bash
npx tsx tests/run-tests.ts
```

Expected: All tests PASS.

- [ ] **Step 8: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 9: Commit**

```bash
git add features/imports/ tests/run-tests.ts
git commit -m "feat(imports): add imports service with live/mock pattern and schema"
```

---

## Task 6: Create Delete Import Session Server Action

**Files:**
- Create: `server/actions/importSession.ts`

- [ ] **Step 1: Create the file**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/server/dal/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ActionResult = { ok: true } | { ok: false; message: string };

export async function deleteImportSession(
  importId: string,
): Promise<ActionResult> {
  if (!importId || typeof importId !== "string") {
    return { ok: false, message: "Import ID is required." };
  }

  const session = await requireSession();
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Data storage is not configured yet." };
  }

  const { error } = await supabase
    .from("import_sessions")
    .delete()
    .eq("id", importId)
    .eq("user_id", session.userId);

  if (error) {
    return { ok: false, message: "This import record could not be removed." };
  }

  revalidatePath("/dashboard/import");
  return { ok: true };
}
```

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add server/actions/importSession.ts
git commit -m "feat(imports): add deleteImportSession server action"
```

---

## Task 7: Update Import Page to Use Live Data + Fix $ Sign + Fix Dead Buttons

**Files:**
- Modify: `app/(dashboard)/dashboard/import/page.tsx`
- Modify: `app/(dashboard)/dashboard/import/import-content.tsx`

### 7a — Update `page.tsx`

- [ ] **Step 1: Replace `app/(dashboard)/dashboard/import/page.tsx`**

```typescript
import { AppShell } from "@/components/dashboard/app-shell";
import { ImportContent } from "./import-content";
import { getImports } from "@/features/imports/services/importsService";
import { requireSession } from "@/server/dal/session";
import type { ImportSession } from "@/features/imports/services/importsSchema";

function getImportMetrics(sessions: ImportSession[]) {
  const now = new Date();
  const thisMonth = sessions.filter((s) => {
    const d = new Date(s.createdAt);
    return (
      d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    );
  });
  return {
    importsThisMonth: thisMonth.length,
    transactionsThisMonth: thisMonth.reduce((s, i) => s + i.savedCount, 0),
    totalSessions: sessions.length,
    latestImportDate:
      sessions.length > 0 ? sessions[0].createdAt : null,
  };
}

export default async function ImportPage() {
  const session = await requireSession();
  const { sessions } = await getImports({ userId: session.userId });
  const metrics = getImportMetrics(sessions);

  return (
    <AppShell active="import">
      <ImportContent initialHistory={sessions} metrics={metrics} />
    </AppShell>
  );
}
```

### 7b — Update `import-content.tsx`

This is a large replacement. Replace the entire file with the following:

- [ ] **Step 2: Replace `app/(dashboard)/dashboard/import/import-content.tsx`**

```typescript
"use client";

import { useState, useRef } from "react";
import { saveImportedTransactions } from "@/server/actions/import";
import { formatCurrency } from "@/lib/format";
import type { ParsedTransaction } from "@/lib/import/parseBankStatement";
import type { ImportSession } from "@/features/imports/services/importsSchema";

type Stage = "idle" | "uploading" | "parsing" | "review";

type AssignedTransaction = ParsedTransaction & {
  assignment: "debt_payment" | "expense" | "savings" | "ignore";
};

type ImportMetrics = {
  importsThisMonth: number;
  transactionsThisMonth: number;
  totalSessions: number;
  latestImportDate: string | null;
};

function formatRelDate(iso: string) {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffH = Math.floor(diffMs / 3600000);
  if (diffH < 1) return "Just now";
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "Yesterday";
  if (diffD < 7) return `${diffD} days ago`;
  return d.toLocaleDateString("nl-NL", { month: "short", day: "numeric" });
}

function UploadGlyph() {
  return (
    <svg viewBox="0 0 80 80" style={{ width: 64, height: 64, margin: "0 auto", display: "block" }}>
      <defs>
        <linearGradient id="upG" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.78 0.16 282)" />
          <stop offset="100%" stopColor="oklch(0.72 0.17 250)" />
        </linearGradient>
      </defs>
      <rect x="14" y="10" width="52" height="60" rx="8" fill="oklch(1 0 0 / 0.04)" stroke="oklch(1 0 0 / 0.12)" strokeWidth="1.5"/>
      <rect x="22" y="22" width="36" height="2.5" rx="1" fill="oklch(1 0 0 / 0.12)"/>
      <rect x="22" y="30" width="28" height="2.5" rx="1" fill="oklch(1 0 0 / 0.10)"/>
      <rect x="22" y="38" width="32" height="2.5" rx="1" fill="oklch(1 0 0 / 0.08)"/>
      <circle cx="56" cy="56" r="13" fill="url(#upG)"/>
      <path d="M56 50 L56 62 M51 55 L56 50 L61 55" fill="none" stroke="oklch(0.99 0 0)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>
    </svg>
  );
}

function CheckIcon({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4 4 10-10"/>
    </svg>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="row gap-12" style={{ padding: "12px 0", borderTop: "1px solid var(--line)" }}>
      <span style={{
        width: 24, height: 24, borderRadius: 8, flexShrink: 0,
        background: "var(--primary-soft)", color: "oklch(0.85 0.10 282)",
        display: "grid", placeItems: "center",
        fontFamily: "var(--font-mono)", fontSize: 12,
      }}>{n}</span>
      <div>
        <div className="f-sm fw-500">{title}</div>
        <div className="f-xs muted" style={{ lineHeight: 1.55 }}>{body}</div>
      </div>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="row gap-8" style={{ padding: "10px 0", borderTop: "1px solid var(--line)", fontSize: 12.5, color: "var(--fg-soft)", alignItems: "flex-start" }}>
      <span style={{ flexShrink: 0, width: 14, height: 14, marginTop: 2, color: "var(--primary-glow)" }}>
        <CheckIcon size={14} />
      </span>
      <span>{children}</span>
    </div>
  );
}

function SourceCard({ name, sub, icon, comingSoon }: { name: string; sub: string; icon: React.ReactNode; comingSoon?: boolean }) {
  return (
    <div className="card flat" style={{ padding: 16, cursor: comingSoon ? "default" : "pointer", position: "relative", opacity: comingSoon ? 0.55 : 1 }}>
      <span className="cat-ico" style={{ width: 34, height: 34 }}>{icon}</span>
      <div className="f-sm fw-500" style={{ marginTop: 12 }}>{name}</div>
      <div className="f-xs muted">{comingSoon ? "Coming soon" : sub}</div>
      {comingSoon && (
        <span style={{
          position: "absolute", top: 10, right: 10,
          fontSize: 10, fontWeight: 600, letterSpacing: "0.04em",
          padding: "2px 7px", borderRadius: 99,
          background: "var(--primary-soft)", color: "oklch(0.85 0.10 282)",
        }}>Soon</span>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: ImportSession["status"] }) {
  const map = {
    complete: { pill: "success", label: "Imported" },
    partial:  { pill: "warn",    label: "Partial"  },
    failed:   { pill: "danger",  label: "Failed"   },
  } as const;
  const s = map[status];
  return <span className={`pill ${s.pill}`}>{s.label}</span>;
}

function ImportRow({ f }: { f: ImportSession }) {
  const ext = f.filename.split(".").pop()?.toUpperCase() ?? "FILE";
  return (
    <tr>
      <td>
        <div className="row gap-12">
          <span className="cat-ico" style={{ width: 32, height: 32 }}>
            <span className="mono" style={{ fontSize: 10, color: "var(--fg-soft)" }}>{ext}</span>
          </span>
          <div>
            <div className="f-sm fw-500" style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.filename}</div>
            <div className="f-xs muted">
              {f.duplicateCount > 0 ? `${f.duplicateCount} duplicate${f.duplicateCount !== 1 ? "s" : ""} skipped` : "All rows accepted"}
            </div>
          </div>
        </div>
      </td>
      <td className="muted f-sm">{f.sourceType}</td>
      <td className="num" style={{ textAlign: "right" }}>{f.savedCount}</td>
      <td><StatusPill status={f.status} /></td>
      <td className="muted f-sm">{formatRelDate(f.createdAt)}</td>
      <td>
        <a
          href={`/dashboard/import/${f.id}`}
          className="btn ghost"
          style={{ fontSize: 12, height: 28, padding: "0 10px" }}
        >
          View
        </a>
      </td>
    </tr>
  );
}

function ParsePreview({
  transactions,
  fileName,
  onAccept,
  onCancel,
  saving,
}: {
  transactions: AssignedTransaction[];
  fileName: string;
  onAccept: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const preview = transactions.slice(0, 8);
  const total = transactions.length;
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div className="row between" style={{ padding: "16px 18px", borderBottom: "1px solid var(--line)" }}>
        <div>
          <div className="card-title">Review parsed transactions</div>
          <div className="card-sub">
            {total} rows found in <span className="mono soft">{fileName}</span>
          </div>
        </div>
        <span className="pill success"><CheckIcon size={10} /> {total} rows ready</span>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Date</th><th>Merchant</th>
            <th style={{ textAlign: "right" }}>Amount</th>
            <th>Category</th>
          </tr>
        </thead>
        <tbody>
          {preview.map((tx, i) => (
            <tr key={i}>
              <td className="mono muted">{tx.date}</td>
              <td>{tx.description}</td>
              <td className="num" style={{ textAlign: "right", color: tx.type === "debit" ? "var(--fg)" : "var(--success)" }}>
                {tx.type === "debit" ? "−" : "+"}{formatCurrency(tx.amount)}
              </td>
              <td><span className="pill">Expense</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row between" style={{ padding: "14px 18px", borderTop: "1px solid var(--line)" }}>
        <span className="f-xs muted">Showing {preview.length} of {total}</span>
        <div className="row gap-8">
          <button className="btn ghost" onClick={onCancel} type="button" disabled={saving}>Cancel</button>
          <button className="btn primary" onClick={onAccept} type="button" disabled={saving}>
            <CheckIcon size={13} /> {saving ? "Saving…" : `Import ${total} row${total === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ImportContent({
  initialHistory,
  metrics,
}: {
  initialHistory: ImportSession[];
  metrics: ImportMetrics;
}) {
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [fileExt, setFileExt] = useState("FILE");
  const [transactions, setTransactions] = useState<AssignedTransaction[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [history, setHistory] = useState<ImportSession[]>(initialHistory);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  // Derive live metrics from current history state + initial metrics
  const now = new Date();
  const thisMonthSessions = history.filter((s) => {
    const d = new Date(s.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const liveImportsThisMonth = thisMonthSessions.length;
  const liveTxThisMonth = thisMonthSessions.reduce((s, i) => s + i.savedCount, 0);

  async function handleFile(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "csv") {
      setUploadError("Only CSV files are supported right now. PDF and other formats are coming soon.");
      return;
    }
    setFileName(file.name);
    setFileExt(file.name.split(".").pop()?.toUpperCase() ?? "FILE");
    setStage("uploading");
    setProgress(0);
    setUploadError(null);
    setSaveResult(null);

    let p = 0;
    const tick = setInterval(() => {
      p += 6 + Math.random() * 10;
      if (p >= 100) {
        p = 100;
        clearInterval(tick);
        setProgress(100);
        setStage("parsing");
        doUpload(file);
      } else {
        setProgress(p);
      }
    }, 90);
  }

  async function doUpload(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/import/bank-statement", { method: "POST", body: formData });
    const json = (await res.json()) as { transactions?: ParsedTransaction[]; error?: string };

    if (!res.ok || json.error) {
      setUploadError(json.error ?? "Upload failed. Please try again.");
      setStage("idle");
      return;
    }

    const mapped = (json.transactions ?? []).map(t => ({ ...t, assignment: "expense" as const }));
    setTransactions(mapped);
    setStage("review");
  }

  async function handleAccept() {
    setSaving(true);
    const result = await saveImportedTransactions({
      transactions,
      filename: fileName,
      sourceType: fileExt,
    });
    setSaving(false);
    if (result.ok) {
      const newSession: ImportSession = {
        id: result.importSessionId,
        filename: fileName,
        sourceType: fileExt,
        transactionCount: transactions.length,
        savedCount: result.count,
        duplicateCount: result.duplicates,
        status: result.count > 0 ? "complete" : "partial",
        createdAt: new Date().toISOString(),
      };
      setHistory(prev => [newSession, ...prev]);
      const dupNote = result.duplicates > 0
        ? ` (${result.duplicates} duplicate${result.duplicates === 1 ? "" : "s"} skipped)`
        : "";
      setSaveResult({ ok: true, message: `${result.count} transaction${result.count === 1 ? "" : "s"} saved.${dupNote}` });
      setStage("idle");
      setTransactions([]);
    } else {
      setSaveResult({ ok: false, message: result.message });
      setStage("idle");
    }
  }

  function handleCancel() {
    setStage("idle");
    setTransactions([]);
    setProgress(0);
    setFileName("");
    setFileExt("FILE");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function scrollToHistory() {
    historyRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <>
      <div className="page-hd">
        <div>
          <h1>Import</h1>
          <div className="sub">Upload statements or CSVs. We turn them into clean transactions.</div>
        </div>
        {history.length > 0 && (
          <button className="btn" type="button" onClick={scrollToHistory}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="6"/><path d="m20 20-4-4"/>
            </svg>
            Browse history
          </button>
        )}
      </div>

      <div className="metrics">
        <div className="metric accent">
          <div className="lbl">Imports this month</div>
          <div className="val">{liveImportsThisMonth}<span className="cents"> files</span></div>
          {liveTxThisMonth > 0
            ? <span className="delta up"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 14l5-5 5 5"/></svg>{liveTxThisMonth} transactions</span>
            : <span className="delta neut">No imports yet</span>
          }
        </div>
        <div className="metric">
          <div className="lbl">Total imported</div>
          <div className="val">{history.reduce((s, i) => s + i.savedCount, 0)}<span className="cents"> tx</span></div>
          <span className="delta neut">All time</span>
        </div>
        <div className="metric">
          <div className="lbl">Total files</div>
          <div className="val" style={{ fontSize: 22 }}>{history.length}</div>
          <span className="delta neut">Across all imports</span>
        </div>
        <div className="metric">
          <div className="lbl">Latest import</div>
          <div className="val" style={{ fontSize: 18 }}>
            {history.length > 0 ? formatRelDate(history[0].createdAt) : "—"}
          </div>
          <span className="delta neut">{history.length > 0 ? history[0].filename.split(".").pop()?.toUpperCase() : "No imports yet"}</span>
        </div>
      </div>

      {saveResult && (
        <div style={{
          marginTop: 14, padding: "12px 16px", borderRadius: "var(--r-md)",
          background: saveResult.ok ? "var(--success-soft)" : "var(--danger-soft)",
          color: saveResult.ok ? "var(--success)" : "oklch(0.84 0.10 24)",
          fontSize: 13, fontWeight: 500, boxShadow: "0 0 0 1px var(--line)",
        }}>
          {saveResult.message}
        </div>
      )}

      <div className="g-12" style={{ marginTop: 16 }}>
        <div style={{ gridColumn: "span 8" }}>
          {stage === "review" ? (
            <ParsePreview
              transactions={transactions}
              fileName={fileName}
              onAccept={handleAccept}
              onCancel={handleCancel}
              saving={saving}
            />
          ) : (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className="card"
              style={{
                padding: "40px 28px",
                background: dragging ? "oklch(0.66 0.18 282 / 0.08)" : "var(--bg-1)",
                boxShadow: dragging
                  ? "0 0 0 1px oklch(0.66 0.18 282 / 0.5), 0 0 0 6px oklch(0.66 0.18 282 / 0.12)"
                  : "0 0 0 1px var(--line), 0 1px 0 var(--inner-hl) inset",
                transition: "all 140ms ease",
                position: "relative", overflow: "hidden",
              }}
            >
              <div style={{
                position: "absolute", inset: 14, borderRadius: 14,
                backgroundImage: [
                  "repeating-linear-gradient(90deg, var(--line-strong) 0 8px, transparent 8px 16px)",
                  "repeating-linear-gradient(180deg, var(--line-strong) 0 8px, transparent 8px 16px)",
                  "repeating-linear-gradient(90deg, var(--line-strong) 0 8px, transparent 8px 16px)",
                  "repeating-linear-gradient(180deg, var(--line-strong) 0 8px, transparent 8px 16px)",
                ].join(", "),
                backgroundSize: "100% 1px, 1px 100%, 100% 1px, 1px 100%",
                backgroundPosition: "top, right, bottom, left",
                backgroundRepeat: "no-repeat",
                pointerEvents: "none", opacity: 0.6,
              }} />

              {(stage === "idle") && (
                <div style={{ textAlign: "center", position: "relative" }}>
                  <UploadGlyph />
                  <div style={{ fontSize: 18, fontWeight: 520, letterSpacing: "-0.02em", marginTop: 14 }}>
                    Drop a statement here
                  </div>
                  <div className="muted f-sm" style={{ marginTop: 4, maxWidth: 380, margin: "4px auto 0" }}>
                    CSV files supported. Export a statement from your bank and drop it here.
                  </div>
                  <div className="row gap-8" style={{ justifyContent: "center", marginTop: 18 }}>
                    <button className="btn primary" type="button" onClick={() => fileInputRef.current?.click()}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                      Choose a file
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={handleInputChange}
                      style={{ display: "none" }}
                    />
                  </div>
                  <div className="row gap-12" style={{ justifyContent: "center", marginTop: 22, color: "var(--fg-mute)", fontSize: 11.5 }}>
                    <span className="row gap-8"><LockIcon /> End-to-end encrypted</span>
                    <span>·</span>
                    <span>Files deleted after parsing</span>
                    <span>·</span>
                    <span>Never used to train models</span>
                  </div>
                </div>
              )}

              {(stage === "uploading" || stage === "parsing") && (
                <div style={{ textAlign: "center", position: "relative", padding: "16px 0" }}>
                  <div className="row gap-12" style={{ justifyContent: "center", marginBottom: 18 }}>
                    <span className="cat-ico" style={{ width: 44, height: 44, borderRadius: 12, background: "var(--primary-soft)", color: "oklch(0.85 0.10 282)" }}>
                      <svg viewBox="0 0 24 24" style={{ width: 18, height: 18 }}>
                        <rect x="5" y="3" width="14" height="18" rx="2" fill="oklch(0.66 0.18 282 / 0.4)" stroke="oklch(0.78 0.16 282)" strokeWidth="1.2"/>
                        <text x="12" y="16" textAnchor="middle" fontSize="6.5" fontFamily="var(--font-mono)" fill="oklch(0.98 0 0)">{fileExt}</text>
                      </svg>
                    </span>
                    <div style={{ textAlign: "left" }}>
                      <div className="f-sm fw-500">{fileName || "Statement.csv"}</div>
                      <div className="f-xs muted mono">Uploading…</div>
                    </div>
                  </div>
                  <div style={{ maxWidth: 420, margin: "0 auto" }}>
                    <div className="pb thick xp">
                      <i style={{ width: `${Math.round(progress)}%`, transition: "width 80ms linear" }} />
                    </div>
                    <div className="row between mt-12" style={{ marginTop: 10 }}>
                      <span className="f-xs muted">{stage === "uploading" ? "Uploading securely" : "Reading transactions"}…</span>
                      <span className="mono f-xs">{Math.round(progress)}%</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {uploadError && (
            <div style={{
              marginTop: 14, padding: "10px 14px", borderRadius: "var(--r-md)",
              background: "var(--danger-soft)", color: "oklch(0.84 0.10 24)",
              fontSize: 12.5, fontWeight: 480,
            }}>
              {uploadError}
            </div>
          )}

          <div className="section-hd">
            <h2>Supported sources</h2>
            <span className="sub">ING, ABN AMRO, generic CSV</span>
          </div>
          <div className="g-3" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            <SourceCard name="Bank PDFs"  sub="Monthly statements"       comingSoon icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/></svg>} />
            <SourceCard name="CSV / TSV"  sub="ING, ABN, generic" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/></svg>} />
            <SourceCard name="OFX / QFX"  sub="Quicken / GnuCash"        comingSoon icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8"/><path d="M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/></svg>} />
            <SourceCard name="Screenshot" sub="OCR-powered"              comingSoon icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="6"/><path d="m20 20-4-4"/></svg>} />
          </div>
        </div>

        <div style={{ gridColumn: "span 4", display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-title">How parsing works</div>
                <div className="card-sub">Three steps, ~10 seconds.</div>
              </div>
            </div>
            <Step n="1" title="Encrypted upload" body="Files leave your device with end-to-end encryption." />
            <Step n="2" title="Smart extraction" body="We pull dates, merchants, amounts — even across multi-page tables." />
            <Step n="3" title="You review" body="Spot-check categories. We learn from your edits going forward." />
          </div>

          <div className="card">
            <div className="card-head">
              <div className="card-title">Tips for cleanest results</div>
            </div>
            <Tip>Original PDFs work best — avoid screenshots when possible.</Tip>
            <Tip>For CSVs, keep headers in the first row.</Tip>
            <Tip>Mix months in one file — we&apos;ll group them.</Tip>
            <Tip>Foreign currencies are converted with the statement&apos;s exchange date.</Tip>
          </div>
        </div>
      </div>

      <div className="section-hd" ref={historyRef}>
        <h2>Recent imports</h2>
        <span className="muted f-xs">Last 50 imports</span>
      </div>

      {history.length === 0 ? (
        <div className="card" style={{ padding: "40px 24px", textAlign: "center" }}>
          <div className="card-title" style={{ marginBottom: 8 }}>No imports yet</div>
          <div className="muted f-sm">Upload your first bank statement to see your history here.</div>
        </div>
      ) : (
        <div className="card flat" style={{ padding: 0, overflow: "hidden" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>File</th>
                <th>Source</th>
                <th style={{ textAlign: "right" }}>Saved</th>
                <th>Status</th>
                <th>Imported</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {history.map(f => <ImportRow key={f.id} f={f} />)}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Run tests**

```bash
npx tsx tests/run-tests.ts
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add app/(dashboard)/dashboard/import/
git commit -m "feat(import): use live import history, fix EUR currency, remove SEED_FILES and dead buttons"
```

---

## Task 8: Create Import Detail Page

**Files:**
- Create: `app/(dashboard)/dashboard/import/[importId]/page.tsx`
- Create: `app/(dashboard)/dashboard/import/[importId]/loading.tsx`

- [ ] **Step 1: Create `app/(dashboard)/dashboard/import/[importId]/loading.tsx`**

```typescript
import { AppShell } from "@/components/dashboard/app-shell";

export default function ImportDetailLoading() {
  return (
    <AppShell active="import">
      <div className="page-hd">
        <div>
          <div style={{ height: 28, width: 220, borderRadius: 6, background: "var(--bg-2)", marginBottom: 8 }} />
          <div style={{ height: 16, width: 160, borderRadius: 4, background: "var(--bg-2)" }} />
        </div>
      </div>
      <div className="card" style={{ padding: 40, textAlign: "center" }}>
        <div className="muted f-sm">Loading import details…</div>
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 2: Create `app/(dashboard)/dashboard/import/[importId]/page.tsx`**

```typescript
import { notFound } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { getImportDetail } from "@/features/imports/services/importsService";
import { requireSession } from "@/server/dal/session";
import { deleteImportSession } from "@/server/actions/importSession";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("nl-NL", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: "complete" | "partial" | "failed" }) {
  const map = {
    complete: { cls: "success", label: "Imported successfully" },
    partial:  { cls: "warn",    label: "Partial import"        },
    failed:   { cls: "danger",  label: "Failed"                },
  } as const;
  const s = map[status];
  return <span className={`pill ${s.cls}`}>{s.label}</span>;
}

export default async function ImportDetailPage({
  params,
}: {
  params: Promise<{ importId: string }>;
}) {
  const { importId } = await params;
  const session = await requireSession();
  const importSession = await getImportDetail({ userId: session.userId, importId });

  if (!importSession) {
    notFound();
  }

  return (
    <AppShell active="import">
      <div className="page-hd">
        <div>
          <h1 style={{ fontFamily: "var(--font-mono)", fontSize: 18 }}>{importSession.filename}</h1>
          <div className="sub row gap-8" style={{ marginTop: 4 }}>
            <StatusBadge status={importSession.status} />
            <span>{formatDate(importSession.createdAt)}</span>
          </div>
        </div>
        <a href="/dashboard/import" className="btn ghost">← Back to imports</a>
      </div>

      <div className="metrics">
        <div className="metric accent">
          <div className="lbl">Source</div>
          <div className="val" style={{ fontSize: 22 }}>{importSession.sourceType}</div>
          <span className="delta neut">File type</span>
        </div>
        <div className="metric">
          <div className="lbl">Transactions found</div>
          <div className="val">{importSession.transactionCount}</div>
          <span className="delta neut">In this file</span>
        </div>
        <div className="metric">
          <div className="lbl">Saved</div>
          <div className="val">{importSession.savedCount}</div>
          <span className="delta up">Added to your dashboard</span>
        </div>
        <div className="metric">
          <div className="lbl">Skipped</div>
          <div className="val">{importSession.duplicateCount}</div>
          <span className="delta neut">Duplicates</span>
        </div>
      </div>

      <div className="section-hd">
        <h2>Details</h2>
      </div>

      <div className="card" style={{ padding: "20px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 32px" }}>
          <div>
            <div className="muted f-xs" style={{ marginBottom: 4 }}>Filename</div>
            <div className="mono f-sm">{importSession.filename}</div>
          </div>
          <div>
            <div className="muted f-xs" style={{ marginBottom: 4 }}>Import ID</div>
            <div className="mono f-xs" style={{ color: "var(--fg-dim)" }}>{importSession.id}</div>
          </div>
          <div>
            <div className="muted f-xs" style={{ marginBottom: 4 }}>Imported on</div>
            <div className="f-sm">{formatDate(importSession.createdAt)}</div>
          </div>
          <div>
            <div className="muted f-xs" style={{ marginBottom: 4 }}>Status</div>
            <StatusBadge status={importSession.status} />
          </div>
        </div>
      </div>

      <div className="section-hd" style={{ marginTop: 24 }}>
        <h2>Actions</h2>
      </div>

      <div className="card" style={{ padding: "20px 24px" }}>
        <div className="f-sm" style={{ marginBottom: 16, color: "var(--fg-soft)" }}>
          Removing this import record does not reverse the transactions that were already saved to your dashboard.
        </div>
        <form
          action={async () => {
            "use server";
            await deleteImportSession(importId);
          }}
        >
          <button
            type="submit"
            className="btn"
            style={{ color: "oklch(0.84 0.10 24)", borderColor: "var(--danger-soft)" }}
          >
            Remove import record
          </button>
        </form>
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 3: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/dashboard/import/[importId]/"
git commit -m "feat(imports): add import detail page /dashboard/import/[importId]"
```

---

## Task 9: Create Notifications Live Service

**Files:**
- Create: `features/notifications/services/notificationsSchema.ts`
- Create: `features/notifications/services/notificationsLiveService.ts`
- Create: `features/notifications/services/notificationsMockService.ts`
- Create: `features/notifications/services/notificationsService.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/run-tests.ts` (before the final `console.log`):

```typescript
  // Test: notifications schema validates correctly
  {
    resetEnv();
    process.env.NEXT_PUBLIC_APP_ENV = "local";
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = "true";
    const mock = requireFresh(
      path.join(__dirname, "..", "features", "notifications", "services", "notificationsMockService.ts"),
    );
    const schema = requireFresh(
      path.join(__dirname, "..", "features", "notifications", "services", "notificationsSchema.ts"),
    );
    const result = mock.getNotifications({ userId: "user-1" });
    schema.NotificationsResponseSchema.parse(result);
    assert(Array.isArray(result.notifications), "notifications mock: notifications is array");
    for (const n of result.notifications) {
      assert(!n.body.includes("$"), `notification body must not contain $: "${n.body}"`);
    }
  }
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx tsx tests/run-tests.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `features/notifications/services/notificationsSchema.ts`**

```typescript
import { z } from "zod";

export const NotificationSchema = z.object({
  id: z.string(),
  kind: z.enum(["win", "insight", "info"]),
  title: z.string(),
  body: z.string(),
  occurredAt: z.string(),
  xp: z.string().optional(),
});

export const NotificationsResponseSchema = z.object({
  userId: z.string(),
  notifications: z.array(NotificationSchema),
  timestamp: z.string(),
});

export type Notification = z.infer<typeof NotificationSchema>;
export type NotificationsResponse = z.infer<typeof NotificationsResponseSchema>;
```

- [ ] **Step 4: Create `features/notifications/services/notificationsMockService.ts`**

```typescript
import { assertMockDataAllowed } from "@/lib/mocks/mockGuards";
import { NotificationsResponseSchema } from "./notificationsSchema";
import type { NotificationsResponse } from "./notificationsSchema";

export function getNotifications({ userId }: { userId: string }): NotificationsResponse {
  assertMockDataAllowed("notifications");
  return NotificationsResponseSchema.parse({
    userId,
    timestamp: new Date().toISOString(),
    notifications: [
      {
        id: "mock-n1",
        kind: "win",
        title: "Savings goal updated",
        body: "Your Emergency Fund grew closer to its target.",
        occurredAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        xp: "+40 XP",
      },
      {
        id: "mock-n2",
        kind: "win",
        title: "Lesson completed — Snowball vs Avalanche",
        body: "You finished this lesson and earned XP toward your next level.",
        occurredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        xp: "+80 XP",
      },
      {
        id: "mock-n3",
        kind: "info",
        title: "Budget category updated",
        body: "Your spending guidance has been recalculated with the latest category numbers.",
        occurredAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
  });
}
```

- [ ] **Step 5: Create `features/notifications/services/notificationsLiveService.ts`**

```typescript
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotificationsResponseSchema } from "./notificationsSchema";
import type { NotificationsResponse, Notification } from "./notificationsSchema";

const KIND_MAP: Record<string, Notification["kind"]> = {
  savings_added: "win",
  savings_goal_created: "win",
  learning_completed: "win",
  debt_payment: "win",
  budget_adjustment: "insight",
};

function xpForKind(kind: string): string | undefined {
  if (kind === "learning_completed") return "+80 XP";
  if (kind === "savings_added") return "+10 XP";
  return undefined;
}

export async function getNotifications({
  userId,
}: {
  userId: string;
}): Promise<NotificationsResponse> {
  const now = new Date().toISOString();
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NotificationsResponseSchema.parse({ userId, notifications: [], timestamp: now });
  }

  const { data, error } = await supabase
    .from("activity_logs")
    .select("id, kind, title, description, occurred_at")
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false })
    .limit(40);

  if (error || !data) {
    return NotificationsResponseSchema.parse({ userId, notifications: [], timestamp: now });
  }

  const notifications: Notification[] = data.map((row) => ({
    id: row.id as string,
    kind: KIND_MAP[row.kind as string] ?? "info",
    title: row.title as string,
    body: (row.description as string) ?? "",
    occurredAt: row.occurred_at as string,
    xp: xpForKind(row.kind as string),
  }));

  return NotificationsResponseSchema.parse({ userId, notifications, timestamp: now });
}
```

- [ ] **Step 6: Create `features/notifications/services/notificationsService.ts`**

```typescript
import { resolveDataSource } from "@/lib/data-source/resolveDataSource";
import * as mockService from "./notificationsMockService";
import * as liveService from "./notificationsLiveService";
import type { NotificationsResponse } from "./notificationsSchema";

type NotificationsDataService = {
  getNotifications: (opts: { userId: string }) => NotificationsResponse | Promise<NotificationsResponse>;
};

const service = resolveDataSource<NotificationsDataService>({
  featureName: "notifications",
  mockService,
  liveService,
});

export function getNotifications(opts: { userId: string }) {
  return service.getNotifications(opts);
}
```

- [ ] **Step 7: Run test to confirm it passes**

```bash
npx tsx tests/run-tests.ts
```

Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add features/notifications/ tests/run-tests.ts
git commit -m "feat(notifications): add live notifications service from activity_logs"
```

---

## Task 10: Update Notifications Page to Use Live Data

**Files:**
- Modify: `app/(dashboard)/dashboard/notifications/page.tsx`
- Modify: `app/(dashboard)/dashboard/notifications/notifications-content.tsx`

### 10a — Update `page.tsx`

- [ ] **Step 1: Replace `app/(dashboard)/dashboard/notifications/page.tsx`**

```typescript
import { AppShell } from "@/components/dashboard/app-shell";
import { requireSession } from "@/server/dal/session";
import { NotificationsContent } from "./notifications-content";
import { getNotifications } from "@/features/notifications/services/notificationsService";

export default async function NotificationsPage() {
  const session = await requireSession();
  const { notifications } = await getNotifications({ userId: session.userId });
  return (
    <AppShell active="notifications">
      <NotificationsContent initialNotifications={notifications} />
    </AppShell>
  );
}
```

### 10b — Update `notifications-content.tsx`

Replace the entire file:

- [ ] **Step 2: Replace `app/(dashboard)/dashboard/notifications/notifications-content.tsx`**

```typescript
"use client";

import { useState } from "react";
import { Bell, Sparkles, Coins } from "lucide-react";
import type { Notification } from "@/features/notifications/services/notificationsSchema";

type Kind = Notification["kind"];
type Filter = "all" | "unread" | "win" | "insight";

type UINotif = Notification & { read: boolean };

function formatRelDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / 3600000);
  if (diffH < 1) return "Today";
  if (diffH < 24) return "Today";
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "Yesterday";
  return d.toLocaleDateString("nl-NL", { month: "short", day: "numeric" });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

const KIND_ICON: Record<Kind, React.FC<{ size?: number }>> = {
  win:     Sparkles,
  insight: Coins,
  info:    Bell,
};

const ACCENT_COLOR: Record<Kind, string> = {
  win:     "var(--success)",
  insight: "var(--warn)",
  info:    "var(--primary-glow)",
};
const ACCENT_SOFT: Record<Kind, string> = {
  win:     "var(--success-soft)",
  insight: "var(--warn-soft)",
  info:    "var(--primary-soft)",
};

function NotifRow({ n, onToggle }: { n: UINotif; onToggle: () => void }) {
  const Icon = KIND_ICON[n.kind];
  const color = ACCENT_COLOR[n.kind];
  const soft  = ACCENT_SOFT[n.kind];
  return (
    <div
      className="row"
      style={{
        padding: "14px 18px",
        gap: 14,
        borderTop: "1px solid var(--line)",
        background: n.read ? "transparent" : "oklch(0.66 0.18 282 / 0.03)",
        position: "relative",
        cursor: "pointer",
      }}
      onClick={onToggle}
    >
      {!n.read && (
        <span style={{
          position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
          width: 6, height: 6, borderRadius: 9, background: "var(--primary-glow)",
          boxShadow: "0 0 6px var(--primary-glow)",
        }} />
      )}
      <span style={{
        width: 32, height: 32, flexShrink: 0, borderRadius: 9,
        background: soft, color,
        display: "grid", placeItems: "center",
      }}>
        <Icon size={15} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row between" style={{ gap: 12 }}>
          <span className="f-sm" style={{ fontWeight: n.read ? 460 : 520, color: "var(--fg)" }}>{n.title}</span>
          <span className="mono muted f-xs" style={{ flexShrink: 0 }}>{formatTime(n.occurredAt)}</span>
        </div>
        <div className="f-xs muted" style={{ marginTop: 3, lineHeight: 1.5 }}>{n.body}</div>
        {n.xp && (
          <span className="mono f-xs" style={{ color: "var(--xp)", marginTop: 6, display: "inline-block" }}>{n.xp}</span>
        )}
      </div>
    </div>
  );
}

export function NotificationsContent({
  initialNotifications,
}: {
  initialNotifications: Notification[];
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<UINotif[]>(
    initialNotifications.map((n) => ({ ...n, read: false })),
  );
  const [digest, setDigest] = useState<"off" | "daily" | "weekly" | "monthly">("weekly");

  const counts = {
    all:     items.length,
    unread:  items.filter((i) => !i.read).length,
    wins:    items.filter((i) => i.kind === "win").length,
    insight: items.filter((i) => i.kind === "insight").length,
  };

  const filtered =
    filter === "all"     ? items :
    filter === "unread"  ? items.filter((i) => !i.read) :
    filter === "win"     ? items.filter((i) => i.kind === "win") :
    items.filter((i) => i.kind === "insight");

  const groups: Record<string, UINotif[]> = {};
  filtered.forEach((n) => {
    const day = formatRelDate(n.occurredAt);
    (groups[day] ??= []).push(n);
  });

  function markAll() { setItems(items.map((i) => ({ ...i, read: true }))); }
  function toggleRead(id: string) { setItems(items.map((i) => i.id === id ? { ...i, read: !i.read } : i)); }

  const FILTERS: { id: Filter; label: string; count: number }[] = [
    { id: "all",     label: "All",      count: counts.all },
    { id: "unread",  label: "Unread",   count: counts.unread },
    { id: "win",     label: "Wins",     count: counts.wins },
    { id: "insight", label: "Insights", count: counts.insight },
  ];

  return (
    <>
      <div className="page-hd">
        <div>
          <h1>Notifications</h1>
          <div className="sub">A quiet inbox. We only ping when it matters.</div>
        </div>
        <div className="row gap-8">
          <button className="btn ghost" onClick={markAll}>Mark all read</button>
        </div>
      </div>

      <div className="metrics" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="metric accent">
          <div className="lbl"><span className="ico"><Bell size={13} /></span>Unread</div>
          <div className="val">{counts.unread}</div>
          <span className="delta neut">{counts.all} total</span>
        </div>
        <div className="metric">
          <div className="lbl"><span className="ico"><Sparkles size={13} /></span>Big wins</div>
          <div className="val">{counts.wins}</div>
          <span className="delta neut">This account</span>
        </div>
        <div className="metric">
          <div className="lbl"><span className="ico"><Coins size={13} /></span>Insights</div>
          <div className="val">{counts.insight}</div>
          <span className="delta neut">In your inbox</span>
        </div>
        <div className="metric">
          <div className="lbl"><span className="ico"><Bell size={13} /></span>Digest</div>
          <div className="val" style={{ fontSize: 18, textTransform: "capitalize" }}>{digest}</div>
          <span className="delta neut">Cadence</span>
        </div>
      </div>

      <div className="g-12" style={{ marginTop: 16 }}>
        <div style={{ gridColumn: "span 8" }}>
          <div className="row between" style={{ margin: "4px 4px 12px" }}>
            <div className="seg">
              {FILTERS.map(({ id, label, count }) => (
                <button
                  key={id}
                  className={filter === id ? "on" : ""}
                  onClick={() => setFilter(id)}
                >
                  {label}{" "}
                  <span className="mono" style={{ color: "var(--fg-dim)", marginLeft: 4, fontSize: 11 }}>{count}</span>
                </button>
              ))}
            </div>
            <span className="muted f-xs">Sorted by newest</span>
          </div>

          <div className="card flat" style={{ padding: 0 }}>
            {Object.keys(groups).length === 0 ? (
              <div style={{ padding: "56px 20px", textAlign: "center", color: "var(--fg-mute)" }}>
                {items.length === 0
                  ? "No activity yet. Complete a lesson or update a goal to see your first notification."
                  : "Nothing matches this filter."}
              </div>
            ) : (
              Object.entries(groups).map(([day, list], gi) => (
                <div key={day}>
                  <div style={{
                    padding: "10px 18px 6px",
                    fontSize: 11, color: "var(--fg-dim)", textTransform: "uppercase", letterSpacing: "0.08em",
                    borderTop: gi === 0 ? undefined : "1px solid var(--line)",
                  }}>
                    {day}
                  </div>
                  {list.map((n) => (
                    <NotifRow
                      key={n.id}
                      n={n}
                      onToggle={() => toggleRead(n.id)}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ gridColumn: "span 4", display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card">
            <div className="card-head">
              <div className="card-title">Digest cadence</div>
            </div>
            <div className="seg" style={{ width: "100%" }}>
              {(["off", "daily", "weekly", "monthly"] as const).map((v) => (
                <button
                  key={v}
                  style={{ flex: 1 }}
                  className={digest === v ? "on" : ""}
                  onClick={() => setDigest(v)}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
            <div className="f-xs muted mt-12" style={{ marginTop: 10 }}>
              Digest emails are not yet sent — this preference will be used when email delivery is enabled.
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div className="card-title">About notifications</div>
            </div>
            <div className="f-xs muted" style={{ lineHeight: 1.7 }}>
              Notifications are generated from your real activity — lessons completed, goals updated, budgets changed. There are no automated alerts or scheduled messages in this version.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Run tests**

```bash
npx tsx tests/run-tests.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/dashboard/notifications/"
git commit -m "feat(notifications): replace hardcoded SEED with live activity_logs data"
```

---

## Task 11: Enhance Savings Goal Form with Additional Fields

**Files:**
- Modify: `lib/validation/forms.ts`
- Modify: `server/actions/dashboard.ts`
- Modify: `components/dashboard/savings-goal-form.tsx`

### 11a — Update schema

- [ ] **Step 1: Write test for new schema fields**

Add to `tests/run-tests.ts` (before final `console.log`):

```typescript
  // Test: savingsGoalSchema accepts optional fields
  {
    const forms = requireFresh(path.join(__dirname, "..", "lib", "validation", "forms.ts"));
    const full = forms.savingsGoalSchema.parse({
      name: "Holiday Fund",
      targetAmount: 1500,
      currentAmount: 200,
      monthlyContribution: 100,
      targetDate: "2027-06-01",
    });
    assert(full.name === "Holiday Fund", "savingsGoalSchema: name preserved");
    assert(full.currentAmount === 200, "savingsGoalSchema: currentAmount accepted");
    assert(full.monthlyContribution === 100, "savingsGoalSchema: monthlyContribution accepted");
    assert(full.targetDate === "2027-06-01", "savingsGoalSchema: targetDate accepted");

    const minimal = forms.savingsGoalSchema.parse({ name: "Emergency", targetAmount: 5000 });
    assert(minimal.currentAmount === 0, "savingsGoalSchema: currentAmount defaults to 0");
    assert(minimal.monthlyContribution === 0, "savingsGoalSchema: monthlyContribution defaults to 0");
    assert(minimal.targetDate == null, "savingsGoalSchema: targetDate defaults to null");
  }
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx tsx tests/run-tests.ts
```

Expected: FAIL — `"savingsGoalSchema: currentAmount defaults to 0"` or similar.

- [ ] **Step 3: Update `savingsGoalSchema` in `lib/validation/forms.ts`**

Find the existing `savingsGoalSchema`:
```typescript
export const savingsGoalSchema = z.object({
  name: z.string().min(2).max(120),
  targetAmount: money.min(1),
});
```

Replace with:
```typescript
export const savingsGoalSchema = z.object({
  name: z.string().min(2).max(120),
  targetAmount: money.min(1),
  currentAmount: money.optional().default(0),
  monthlyContribution: money.optional().default(0),
  targetDate: z.string().nullable().optional().default(null),
});
```

- [ ] **Step 4: Update `createSavingsGoal` in `server/actions/dashboard.ts`**

Find the insert call inside `createSavingsGoal`:
```typescript
  const { data: goal, error } = await supabase
    .from("savings_goals")
    .insert({
      user_id: session.userId,
      name: parsed.data.name,
      target_amount: parsed.data.targetAmount,
      saved_amount: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
```

Replace with:
```typescript
  const { data: goal, error } = await supabase
    .from("savings_goals")
    .insert({
      user_id: session.userId,
      name: parsed.data.name,
      target_amount: parsed.data.targetAmount,
      saved_amount: parsed.data.currentAmount ?? 0,
      monthly_contribution: parsed.data.monthlyContribution ?? 0,
      target_date: parsed.data.targetDate ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
```

- [ ] **Step 5: Update `components/dashboard/savings-goal-form.tsx`**

Replace the entire file:

```typescript
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSavingsGoal } from "@/server/actions/dashboard";

export function SavingsGoalForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [current, setCurrent] = useState("");
  const [monthly, setMonthly] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function reset() {
    setName("");
    setTarget("");
    setCurrent("");
    setMonthly("");
    setTargetDate("");
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const targetAmount = parseFloat(target);
    if (!name.trim() || isNaN(targetAmount) || targetAmount <= 0) {
      setError("Enter a valid goal name and target amount.");
      return;
    }
    const currentAmount = current ? parseFloat(current) : 0;
    const monthlyContribution = monthly ? parseFloat(monthly) : 0;
    if (isNaN(currentAmount) || currentAmount < 0) {
      setError("Current amount must be 0 or more.");
      return;
    }
    if (isNaN(monthlyContribution) || monthlyContribution < 0) {
      setError("Monthly contribution must be 0 or more.");
      return;
    }
    startTransition(async () => {
      const result = await createSavingsGoal({
        name: name.trim(),
        targetAmount,
        currentAmount,
        monthlyContribution,
        targetDate: targetDate || null,
      });
      if (result.ok) {
        setOpen(false);
        reset();
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
    <form onSubmit={handleSubmit} className="card" style={{ padding: "20px 24px", maxWidth: 540 }}>
      <div className="card-title" style={{ marginBottom: 16 }}>New savings goal</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label className="f-xs muted" style={{ display: "block", marginBottom: 4 }}>Goal name *</label>
          <input
            className="input"
            placeholder="e.g. Emergency Fund"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: "100%", height: 36, padding: "0 12px", borderRadius: 8, boxShadow: "0 0 0 1px var(--line)", background: "oklch(1 0 0 / 0.04)", border: 0, color: "var(--fg)", font: "inherit", fontSize: 13 }}
            autoFocus
            required
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label className="f-xs muted" style={{ display: "block", marginBottom: 4 }}>Target amount (€) *</label>
            <input
              type="number"
              className="input mono"
              placeholder="5000"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              min="1"
              step="1"
              style={{ width: "100%", height: 36, padding: "0 12px", borderRadius: 8, boxShadow: "0 0 0 1px var(--line)", background: "oklch(1 0 0 / 0.04)", border: 0, color: "var(--fg)", font: "inherit", fontSize: 13 }}
              required
            />
          </div>
          <div>
            <label className="f-xs muted" style={{ display: "block", marginBottom: 4 }}>Already saved (€)</label>
            <input
              type="number"
              className="input mono"
              placeholder="0"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              min="0"
              step="1"
              style={{ width: "100%", height: 36, padding: "0 12px", borderRadius: 8, boxShadow: "0 0 0 1px var(--line)", background: "oklch(1 0 0 / 0.04)", border: 0, color: "var(--fg)", font: "inherit", fontSize: 13 }}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label className="f-xs muted" style={{ display: "block", marginBottom: 4 }}>Monthly contribution (€)</label>
            <input
              type="number"
              className="input mono"
              placeholder="100"
              value={monthly}
              onChange={(e) => setMonthly(e.target.value)}
              min="0"
              step="1"
              style={{ width: "100%", height: 36, padding: "0 12px", borderRadius: 8, boxShadow: "0 0 0 1px var(--line)", background: "oklch(1 0 0 / 0.04)", border: 0, color: "var(--fg)", font: "inherit", fontSize: 13 }}
            />
          </div>
          <div>
            <label className="f-xs muted" style={{ display: "block", marginBottom: 4 }}>Target date (optional)</label>
            <input
              type="date"
              className="input mono"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              style={{ width: "100%", height: 36, padding: "0 12px", borderRadius: 8, boxShadow: "0 0 0 1px var(--line)", background: "oklch(1 0 0 / 0.04)", border: 0, color: "var(--fg)", font: "inherit", fontSize: 13 }}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="f-xs" style={{ color: "var(--danger)", marginTop: 10 }}>{error}</div>
      )}

      <div className="row gap-8" style={{ marginTop: 16 }}>
        <button className="btn primary" type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Create goal"}
        </button>
        <button className="btn ghost" type="button" onClick={() => { setOpen(false); reset(); }}>
          Cancel
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 6: Run test to confirm all tests pass**

```bash
npx tsx tests/run-tests.ts
```

Expected: All tests PASS.

- [ ] **Step 7: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add lib/validation/forms.ts server/actions/dashboard.ts components/dashboard/savings-goal-form.tsx tests/run-tests.ts
git commit -m "feat(savings): add currentAmount, monthlyContribution, targetDate to savings goal form"
```

---

## Task 12: Final Validation — Typecheck, Lint, Test, Build

- [ ] **Step 1: Run the full test suite**

```bash
npx tsx tests/run-tests.ts
```

Expected: `All tests passed (lightweight)` printed, exit 0.

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: No errors or warnings.

- [ ] **Step 4: Run mock data audit (if the script exists)**

```bash
npm run ci:mock-audit 2>/dev/null || echo "ci:mock-audit not configured"
```

- [ ] **Step 5: Run build**

```bash
npm run build
```

Expected: Build completes successfully. No type errors, no missing modules.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: final MVP launch hardening — all checks pass"
```

---

## Self-Review Checklist

### Spec Coverage

| Requirement | Task |
|-------------|------|
| `/dashboard/learn` mock data | learn already uses live service — no change needed ✓ |
| `/dashboard/import` mock data | Task 7 — SEED_FILES removed ✓ |
| `/dashboard/notifications` mock data | Task 10 — SEED removed ✓ |
| Currency EUR throughout | Tasks 1, 2, 7 ✓ |
| No Dollar signs | Tasks 1, 2, 7 (ParsePreview), 10 (SEED removed) ✓ |
| Every button/feature works | Dead buttons fixed: "Browse history" (scrolls to table, Task 7), "Open full review" removed ✓ |
| Users can add savings goals | Task 11 — existing form + new fields ✓ |
| Recent import detail page | Task 8 ✓ |
| `assertMockDataAllowed()` | Already exists and used in all mock services ✓ |
| Production rejects mock | `mockGuards.ts` already throws in production ✓ |
| No mock fallback after live failure | `resolveDataSource` never falls back, returns empty state ✓ |
| RLS-safe insert | All actions use `.eq("user_id", session.userId)` ✓ |
| Loading/empty/error states | Import empty state (Task 7), notifications empty state (Task 10), import detail notFound (Task 8) ✓ |
| Auth protects routes | `requireSession()` added to import page (Task 7) ✓ |
| Tests for production mock rejection | Existing tests in `run-tests.ts` cover this ✓ |
| Tests for currency | Task 1 ✓ |
| Tests for imports service | Task 5 ✓ |
| Tests for notifications service | Task 9 ✓ |
| Tests for savings goal schema | Task 11 ✓ |

### Advisory Copy Violations Found

Grep found no violations of "You should / Best / Recommended / Optimal / Do this" in app files. The `notifications-content.tsx` SEED data contained advisory language ("Want a 30-day pause on Spotify Premium?") — this is removed entirely in Task 10.

### Post-MVP Features Deferred (Not Removed — Marked Coming Soon)

- Bank PDFs upload (SourceCard has `comingSoon` flag — already deferred)
- OFX/QFX (already `comingSoon`)
- Screenshot OCR (already `comingSoon`)
- Quiet hours persistence (removed the Quiet Hours card — client-side state not worth persisting for MVP)
- Digest cadence persistence (kept as client-state, noted as "will be used when email delivery is enabled")

### Placeholder Scan

No "TBD", "TODO", "implement later", or "Similar to Task N" patterns found in this plan.

### Type Consistency

- `ImportSession` type defined in `importsSchema.ts` and used consistently across service, page, and content component.
- `Notification` type defined in `notificationsSchema.ts` and used consistently in service, page, and content component.
- `saveImportedTransactions` now accepts `filename` and `sourceType` — `import-content.tsx` passes these in `handleAccept`.
- `savingsGoalSchema` new fields (`currentAmount`, `monthlyContribution`, `targetDate`) used in `createSavingsGoal` action and form component.

---

## Unresolved Risks

1. **Import page requires migration 006**: Users must run `006_import_sessions.sql` against their Supabase instance before the import history tracking works. The live service handles missing data gracefully (returns empty array), so the page won't break, but history won't be tracked until the migration is applied.

2. **Notifications rely on activity_logs**: New users with no activity will see an empty notifications inbox. This is correct behavior (proper empty state), not a bug.

3. **Import detail page inline server action**: The `app/(dashboard)/dashboard/import/[importId]/page.tsx` uses an inline `"use server"` form action. Verify that Next.js 16 supports inline server actions inside server components. If not, move it to `server/actions/importSession.ts` and import it directly (the `deleteImportSession` action is already there for this fallback).

4. **`params` as Promise**: Task 8 uses `params: Promise<{ importId: string }>` with `await params`. Verify in `node_modules/next/dist/docs/` that this is the correct Next.js 16 pattern for dynamic route params.

---

## Launch Readiness Verdict

After all tasks complete and all checks pass:

- ✅ Production cannot silently use mock data
- ✅ Import and notifications pages use live services
- ✅ Euro is used throughout; no Dollar signs remain in user-facing UI
- ✅ "Browse history" button works (scrolls to history table)
- ✅ "Open full review" dead button removed
- ✅ Users can add savings goals with full field set
- ✅ Import detail page exists at `/dashboard/import/[importId]`
- ✅ All new empty states added
- ✅ Auth and RLS respected
- ✅ typecheck / lint / test / build pass

**LAUNCH READY** after Task 12 passes.
