# LLM Cost Tracker

A proxy-based cost, latency, and usage dashboard for LLM API calls — the
Helicone-style wedge (Helicone itself went into maintenance mode after
its March 2026 acquisition by Mintlify), built entirely on free-tier
infrastructure.

## Stack
- **Proxy + dashboard**: Next.js on Vercel (Edge Functions, free tier)
- **Database**: Supabase Postgres (free project)
- **Rate limiting + caching**: Upstash Redis (free tier)
- **Alert email**: Resend (free tier, optional)

## How it works
1. A caller's app sends requests to `/api/proxy/v1/chat/completions`
   instead of calling OpenAI/Groq/Anthropic directly — just a base URL
   change, same request/response shape.
2. The route checks the caller's project API key, applies a per-project
   rate limit, and checks Redis for a cached identical response.
3. On a cache miss, it forwards the request upstream, computes token
   cost from `lib/pricing.ts`, and logs the request to Supabase.
4. The dashboard reads from two Postgres views (`daily_spend`,
   `feature_spend`) and subscribes to Supabase Realtime for live
   updates as new requests land.
5. If a project's spend for the day crosses its `daily_budget_usd`,
   `/api/alert` fires an email via Resend.

## Setup

1. **Supabase**: create a free project, then run `supabase/schema.sql`
   in the SQL editor. Copy the project URL, anon key, and service role
   key into `.env.local` (see `.env.example`).
2. **Upstash**: create a free Redis database, copy the REST URL and
   token into `.env.local`.
3. **Upstream provider**: set `UPSTREAM_BASE_URL` and `UPSTREAM_API_KEY`
   to whichever LLM provider you're proxying (OpenAI, Groq, etc.). This
   key lives only in your server env — callers never see it.
4. Create a demo project row directly in Supabase:
   ```sql
   insert into projects (name) values ('demo') returning id, api_key;
   ```
5. `npm install && npm run dev`, then point a test client at
   `http://localhost:3000/api/proxy/v1/chat/completions` with
   `Authorization: Bearer <api_key>` from step 4.
6. View the dashboard at `/dashboard?project=<project id from step 4>`.
7. Deploy: push to GitHub, import into Vercel, add the same env vars
   there.

## Demo script (~90 seconds)
1. Show a normal app calling OpenAI directly — no visibility into cost.
2. Change one line (base URL) to point at the proxy — nothing else changes.
3. Fire a few requests live; the dashboard updates in real time.
4. Repeat the exact same prompt — second call shows a cache hit, $0
   cost, latency near-zero.
5. Show the per-feature cost breakdown (via the `X-Feature` header)
   and a budget alert firing.

## Notes / known gaps to mention if asked
- `lib/pricing.ts` has an illustrative rate table, not live pricing —
  say so if asked, and treat it as a starting point.
- Streaming responses aren't token-counted in this scaffold (only
  non-streaming JSON responses are parsed for `usage`).
- Dashboard auth is stubbed via a `?project=` query param for demo
  speed — swap in Supabase Auth + RLS-backed project lookup for
  anything beyond a hackathon.
