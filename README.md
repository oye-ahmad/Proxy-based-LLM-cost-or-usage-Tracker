# ⚡ PulseProxy AI

> **Smart Edge Gateway, Semantic Caching & Real-Time Cost Intelligence Engine for LLMs**

**PulseProxy AI** is a production-ready, ultra-fast Edge proxy built on Next.js 14, Upstash Redis, and Supabase. It sits between your applications and upstream LLM providers (OpenAI, Groq, Anthropic, OpenRouter) to deliver **sub-20ms semantic caching ($0 token cost)**, **feature-level cost attribution**, **sliding-window rate limiting**, and **real-time budget enforcement**.

---

<img width="1895" height="898" alt="image" src="https://github.com/user-attachments/assets/bdad19be-2dee-475c-bd42-145ddb75850e" />

<img width="1886" height="782" alt="image" src="https://github.com/user-attachments/assets/3272af60-606e-4765-be63-fe364b17c4dc" />



## 🌍 Real-World Use Case: Why PulseProxy AI?

Imagine you run a multi-feature SaaS application (**SaaSify**) with 3 distinct AI-powered features:
1. 💬 **Customer Support Chatbot** (`X-Feature: support-bot`)
2. 📄 **Document Summarizer** (`X-Feature: doc-summarizer`)
3. 🤖 **Internal Slack Assistant** (`X-Feature: slack-bot`)

Without **PulseProxy AI**, you face major production pain points:
- **No Cost Visibility**: Providers like OpenAI send one total bill at the end of the month. You have no idea which feature or tenant is burning your budget.
- **Wasted Token Spend**: Users repeatedly ask identical questions ("*What are your business hours?*"), forcing you to pay full LLM token prices over and over.
- **Vulnerability to Abuse**: A single runaway loop or malicious bot can drain your credit balance in minutes.

---

### 💡 How PulseProxy AI Solves This in Production

#### 1. Instant Response Caching (Sub-20ms Latency & $0 Cost)
- **User A** asks: *"What is your refund policy?"* ➔ Forwarded to LLM. Latency: `1,800 ms`, Cost: `$0.003`.
- **User B** asks 2 minutes later: *"What is your refund policy?"*
- **PulseProxy AI** intercepts the request at the Edge, matches the SHA-256 prompt signature in Upstash Redis, and returns the response in **15 ms** at **$0.00 cost**!
- **Result**: **100% token cost savings** on duplicate requests and near-instant user responses.

#### 2. Feature & User Cost Attribution (`X-Feature` & `X-User`)
- By sending headers like `X-Feature: doc-summarizer` and `X-User: acme_corp`, your dashboard live-aggregates costs per feature and tenant.
- **Result**: You discover `doc-summarizer` consumes 85% of your API budget, allowing you to price your premium tiers accurately.

#### 3. Automated Rate Limiting & Abuse Safeguards
- If a client or bot floods 300 requests/minute, PulseProxy AI's sliding window rate-limiter blocks them with HTTP `429 Too Many Requests`.
- **Result**: Protects your upstream API keys from unexpected $1,000+ monthly bill spikes.

#### 4. Automated Daily Budget Threshold Alerts
- Set a daily budget limit (`daily_budget_usd = $10.00`). If spend reaches the cap, an automated webhook fires an instant notification to your email via Resend.

---

## 🚀 1-Line Code Integration

Simply change your SDK's `baseURL` to point to your live proxy—no complex refactoring needed:

### TypeScript / Node.js (OpenAI SDK)

```typescript
import OpenAI from "openai";

const openai = new OpenAI({
  // Point to your live PulseProxy AI endpoint
  baseURL: "https://your-pulseproxy.vercel.app/api/proxy/v1",
  apiKey: "proj_live_xxxxxx", // Project API key generated in your dashboard
  defaultHeaders: {
    "X-Feature": "support-bot",
    "X-User": "tenant_acme_corp"
  }
});

// Standard API call — works seamlessly!
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
    base_url="https://your-pulseproxy.vercel.app/api/proxy/v1",
    api_key="proj_live_xxxxxx",
    default_headers={
        "X-Feature": "doc-summarizer",
        "X-User": "user_456"
    }
)

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Summarize today's analytics."}]
)
```

---

## 🏗️ System Architecture

```
[ Your Frontend / Mobile App / Microservice ]
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
                      ▼ 5. Log Request to Supabase DB (Pushes to Live Realtime Dashboard)
```

---

## 🌐 Deploying to Vercel (Step-by-Step)

### 1. Import Repository
1. Go to **[Vercel](https://vercel.com)** and log in with GitHub.
2. Click **Add New...** ➔ **Project** and select `Proxy-based-LLM-cost-or-usage-Tracker`.

### 2. Configure Environment Variables
Copy over the environment variables from your local `.env`:

| Key | Description |
| :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Public Anon Key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST Token |
| `UPSTREAM_BASE_URL` | Upstream provider URL (`https://api.openai.com/v1` or `https://api.groq.com/openai/v1`) |
| `UPSTREAM_API_KEY` | Your master OpenAI / Groq API Key |
| `RESEND_API_KEY` *(optional)* | Resend API Key for budget email notifications |
| `ALERT_TO_EMAIL` *(optional)* | Recipient email address for alerts |

### 3. Deploy
Click **Deploy**. Vercel will build your Edge function proxy and assign a live production URL:
`https://your-pulseproxy.vercel.app/api/proxy/v1`

---

## 🛠️ Stack & Tech Specs

- **Proxy Engine**: Next.js 14 (Edge Runtime)
- **Database**: Supabase Postgres (with Realtime WebSockets)
- **Cache & Rate Limiting**: Upstash Redis REST
- **UI & Analytics**: TailwindCSS + Recharts
- **Email Notifications**: Resend API

---

## 📄 License

MIT License. Free to use, modify, and deploy for production applications.
