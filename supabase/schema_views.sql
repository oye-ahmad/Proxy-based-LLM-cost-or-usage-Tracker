-- Run this in Supabase SQL Editor if you want database-level views & Realtime setup

-- 1. Daily spend view
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

-- 2. Feature spend view
create or replace view feature_spend as
select
  project_id,
  coalesce(feature_tag, 'untagged') as feature_tag,
  count(*) as request_count,
  sum(cost_usd) as total_cost_usd
from requests
group by project_id, coalesce(feature_tag, 'untagged');

-- 3. Enable Realtime on requests table
alter publication supabase_realtime add table requests;
