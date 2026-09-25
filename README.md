# ⚡ LLM Usage & Cost Tracker Proxy

A high-performance, proxy-based LLM cost control, latency monitoring, and semantic caching engine — built for production Edge runtimes.

Point your existing LLM SDKs (OpenAI, Groq, Anthropic, OpenRouter) to this proxy with a single line `baseURL` change to instantly unlock real-time token tracking, response caching, cost attribution by feature/user, rate-limiting, and budget enforcement alerts.

---

## 🌟 Key Features & Advantages

- **⚡ Instant Response Caching (Upstash Redis)**: 
  Identical prompts are served directly from Redis in **~15ms** at **$0.00 cost**, saving up to 60%+ on LLM API bills.
- **🏷️ Granular Cost Attribution (`X-Feature` & `X-User`)**:
  Tag requests with headers like `X-Feature: support-bot` or `X-User: org_123` to track exact costs per product feature or tenant.
- **📊 Real-Time Realtime Dashboard**:
  Live streaming of all incoming requests, latencies, cache status, and aggregated spend trends via Supabase Realtime WebSockets.
- **🛡️ Rate Limiting & Abuse Prevention**:
  Sliding-window rate limiting per project API key prevents runaway scripts or malicious API abuse.
- **🚨 Automated Budget Alerts**:
  Set daily spending limits per project (`daily_budget_usd`). Triggers automated email notifications via Resend when limits are exceeded.
- **🌐 Provider & Model Agnostic**:
  Works out of the box with OpenAI, Groq, Anthropic, OpenRouter, or self-hosted LLM endpoints.

---

## 🏗️ Architecture

```
[ Your Frontend / Mobile App / Backend ]
                │
                │  1. HTTP Request (with Bearer Key & X-Feature Header)
                ▼
      ┌──────────────────┐
      │  Next.js Edge    │ ── 2. Check Rate Limits & SHA-256 Cache (Upstash Redis)
      │  Proxy Server    │ ── Cache HIT? ──> Return Response Immediately ($0 cost, ~15ms)
      └──────────────────┘
                │
                │ Cache MISS?
                ▼ 3. Forward to Upstream LLM (OpenAI / Groq)
      ┌──────────────────┐
      │ Upstream Provider│ ── 4. Calculate Tokens & Pricing, Cache in Redis
      └──────────────────┘
                │
                ▼ 5. Log Request to Supabase DB (Pushes to Live Dashboard)
```

---

## 💻 Integration Examples

### Node.js / TypeScript (OpenAI SDK)

Change only the `baseURL` and pass your project API key:

```typescript
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://your-deployed-proxy.vercel.app/api/proxy/v1",
  apiKey: "proj_live_xxxxxx", // Project API key generated in tracker dashboard
  defaultHeaders: {
    "X-Feature": "customer-support-bot",
    "X-User": "tenant_company_abc"
  }
});

const response = await openai.chat.completions.create({
  model: "qwen/qwen3.8-27b",
  messages: [{ role: "user", content: "Explain quantum computing in one sentence." }]
});

console.log(response.choices[0].message.content);
```

### Python SDK

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://your-deployed-proxy.vercel.app/api/proxy/v1",
    api_key="proj_live_xxxxxx",
    default_headers={
        "X-Feature": "data-pipeline",
        "X-User": "user_456"
    }
)

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Summarize today's logs."}]
)
```

### cURL

```bash
curl -X POST "https://your-deployed-proxy.vercel.app/api/proxy/v1/chat/completions" \
  -H "Authorization: Bearer proj_live_xxxxxx" \
  -H "X-Feature: dashboard-demo" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen/qwen3.8-27b",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

---

## 🛠️ Stack

- **Proxy Engine**: Next.js 14 (Edge Functions)
- **Database**: Supabase Postgres (with Realtime WebSockets)
- **Cache & Rate Limiter**: Upstash Redis REST
- **Styling & UI**: TailwindCSS + Recharts
- **Email Alerts**: Resend API

---

## ⚙️ Environment Variables

Create a `.env` file in the root directory (refer to `.env.example`):

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your_supabase_anon_key"
SUPABASE_SERVICE_ROLE_KEY="your_supabase_service_role_key"

# Upstash Redis Configuration
UPSTASH_REDIS_REST_URL="https://your-instance.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your_upstash_redis_token"

# Upstream Provider Configuration
UPSTREAM_BASE_URL="https://api.openai.com/v1"
UPSTREAM_API_KEY="your_upstream_provider_api_key"

# Optional Budget Alert Configuration
RESEND_API_KEY="re_your_resend_api_key"
ALERT_TO_EMAIL="admin@yourdomain.com"
```

---

## 🚀 Running Locally

1. **Clone the repository**:
   ```bash
   git clone https://github.com/oye-ahmad/Proxy-based-LLM-cost-or-usage-Tracker.git
   cd Proxy-based-LLM-cost-or-usage-Tracker
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up database schema**:
   Run `schema.sql` and `supabase/schema_views.sql` inside your Supabase project's SQL Editor.

4. **Start local development server**:
   ```bash
   npm run dev
   ```
   Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 🌐 Production Deployment (Vercel)

1. Push your repository to GitHub.
2. Import the repository into **[Vercel](https://vercel.com)**.
3. Configure the environment variables in Vercel project settings.
4. Deploy! Your edge proxy endpoint will be live at `https://your-app.vercel.app/api/proxy/v1`.

---

## 📄 License

MIT License. Feel free to use, modify, and deploy for your own applications.
