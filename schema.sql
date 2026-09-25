-- Run this in the Supabase SQL editor for a fresh project.

create extension if not exists "pgcrypto";

-- One row per app/team using the tracker. api_key is what they put
-- in their own client as the proxy credential (never the raw upstream key).
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  api_key text unique not null default encode(gen_random_bytes(24), 'hex'),
  owner_id uuid references auth.users(id) on delete set null,
  daily_budget_usd numeric default 5,
  created_at timestamptz not null default now()
);

-- One row per proxied LLM call.
create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  model text not null,
  prompt_tokens int not null default 0,
  completion_tokens int not null default 0,
  cost_usd numeric not null default 0,
  latency_ms int not null default 0,
  cached boolean not null default false,
  status_code int not null default 200,
  feature_tag text,        -- set by caller via X-Feature header, e.g. "chat-summarizer"
  user_tag text,            -- set by caller via X-User header, for per-user cost breakdown
  created_at timestamptz not null default now()
);

create index if not exists requests_project_created_idx
  on requests (project_id, created_at desc);

create index if not exists requests_feature_idx
  on requests (project_id, feature_tag);

-- Convenience view: spend grouped by day, used by the dashboard's trend chart.
create or replace view daily_spend as
select
  project_id,
  date_trunc('day', created_at) as day,
  count(*) as request_count,
  sum(cost_usd) as total_cost_usd,
  sum(prompt_tokens + completion_tokens) as total_tokens,
  avg(latency_ms) as avg_latency_ms
from requests
group by project_id, date_trunc('day', created_at);

-- Convenience view: spend grouped by feature tag, used for the "what's
-- burning my budget" breakdown.
create or replace view feature_spend as
select
  project_id,
  coalesce(feature_tag, 'untagged') as feature_tag,
  count(*) as request_count,
  sum(cost_usd) as total_cost_usd
from requests
group by project_id, coalesce(feature_tag, 'untagged');

alter table projects enable row level security;
alter table requests enable row level security;

-- Owners can only see their own project and its requests.
create policy "owners read own projects" on projects
  for select using (auth.uid() = owner_id);

create policy "owners read own requests" on requests
  for select using (
    project_id in (select id from projects where owner_id = auth.uid())
  );

-- Inserts happen via the server-side service role key from the proxy
-- route, which bypasses RLS by design — no insert policy needed here.
