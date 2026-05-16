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
