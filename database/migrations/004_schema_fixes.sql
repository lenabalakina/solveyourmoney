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
