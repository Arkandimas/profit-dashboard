-- shopee_tokens: stores OAuth tokens for Edge Functions (no cookie access in Deno)
create table if not exists shopee_tokens (
  shop_id       bigint primary key,
  access_token  text        not null,
  refresh_token text        not null,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Row-level security: only service role can read/write
alter table shopee_tokens enable row level security;

-- sync_logs: records each Edge Function run result for frontend polling
create table if not exists sync_logs (
  id           bigserial   primary key,
  sync_type    text        not null,   -- 'orders' | 'escrow' | 'scheduled'
  status       text        not null,   -- 'success' | 'error'
  synced_count integer     not null default 0,
  duration_ms  integer,
  metadata     jsonb,
  created_at   timestamptz not null default now()
);

alter table sync_logs enable row level security;

-- Service role bypass (used by Edge Functions with SUPABASE_SERVICE_ROLE_KEY)
create policy "service role full access shopee_tokens"
  on shopee_tokens for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "service role full access sync_logs"
  on sync_logs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Index for fast latest-log queries
create index if not exists sync_logs_created_at_idx on sync_logs (created_at desc);
