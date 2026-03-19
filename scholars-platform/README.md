# ScholarPath — scholars.ahsansuny.com

AI-powered scholarship aggregation platform for Bangladeshi and global students.
Automatically collects, classifies, and delivers scholarships, PhD positions, fellowships, and grants with nationality-aware filtering and conversational AI search.

## Tech Stack (Free Tier)

| Layer | Tool | Cost |
|---|---|---|
| Frontend + Backend | Next.js 14 on Vercel | Free |
| Database | Supabase PostgreSQL | Free (500MB) |
| Vector Search | Pinecone | Free (100k vectors) |
| AI Extraction | Claude Haiku | ~$0.40/mo |
| AI RAG Search | Claude Sonnet | ~$1-3/mo |
| Embeddings | HuggingFace all-MiniLM-L6-v2 | Free |
| Email Alerts | Brevo | Free (300/day) |
| Crawl Scheduler | GitHub Actions cron | Free (2000 min/mo) |

**Total: ~$3-4/month**

## Quick Start

### 1. Sign up for required services

- [Supabase](https://supabase.com) — free project
- [Pinecone](https://app.pinecone.io) — free index (384 dims, cosine)
- [Anthropic Console](https://console.anthropic.com) — API key
- [HuggingFace](https://huggingface.co/settings/tokens) — API token
- [Brevo](https://app.brevo.com) — free account
- [Vercel](https://vercel.com) — free account

### 2. Set up environment

```bash
cp .env.example .env.local
# Fill in all values in .env.local
```

### 3. Set up Supabase database

1. Open [Supabase Dashboard](https://supabase.com) → your project
2. Go to **SQL Editor**
3. Copy and run `scripts/schema.sql`

### 4. Create Pinecone index

In Pinecone dashboard:
- Index name: `scholars-opportunities`
- Dimensions: `384`
- Metric: `cosine`
- Cloud: `aws` / Region: `us-east-1` (free tier)

### 5. Install and run locally

```bash
# Frontend
npm install
npm run dev
# → http://localhost:3000

# Crawlers (Python)
cd crawlers
pip install -r requirements.txt
python -m playwright install chromium

# Test a single crawler
python pipeline.py --source shed --dry-run

# Run all crawlers
python pipeline.py
```

### 6. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Add environment variables in Vercel dashboard
# Settings → Environment Variables → add all from .env.example
```

### 7. Connect your domain

In Vercel → Settings → Domains:
- Add `scholars.ahsansuny.com`
- Add CNAME record: `scholars → cname.vercel-dns.com`

### 8. Set up GitHub Actions

Add these secrets to your GitHub repo (Settings → Secrets):

```
ANTHROPIC_API_KEY
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
PINECONE_API_KEY
PINECONE_INDEX_NAME
HUGGINGFACE_API_TOKEN
CRON_SECRET
SITE_URL
```

The crawlers will run automatically every day at 06:00 UTC (12:00 BD time).

---

## Project Structure

```
scholars-platform/
├── app/                          # Next.js 14 App Router
│   ├── page.tsx                  # Homepage + search + AI chat
│   ├── opportunities/[id]/       # Detail page
│   └── api/
│       ├── search/route.ts       # RAG search (Pinecone + Claude)
│       ├── opportunities/route.ts # List/filter API
│       └── alerts/route.ts       # Deadline alert cron
├── components/
│   ├── OpportunityCard.tsx       # Card component
│   ├── SearchBar.tsx             # Keyword search
│   ├── ChatSearch.tsx            # AI conversational search
│   ├── FilterSidebar.tsx         # Faceted filters
│   ├── Navbar.tsx
│   └── StatsBar.tsx
├── crawlers/
│   ├── base.py                   # BaseCrawler abstract class
│   ├── shed_gov_bd.py            # SHED MoEdu Bangladesh
│   ├── euraxess.py               # EURAXESS EU
│   ├── daad.py                   # DAAD Germany
│   ├── opportunitydesk.py        # OpportunityDesk
│   ├── daily_star_bd.py          # The Daily Star BD
│   ├── scholars4dev.py           # scholars4dev
│   ├── pipeline.py               # Main orchestrator
│   └── requirements.txt
├── lib/
│   ├── supabase.ts               # DB queries + upsert
│   ├── pinecone.ts               # Vector search + embed
│   ├── claude.ts                 # RAG + extraction
│   └── utils.ts
├── scripts/
│   └── schema.sql                # Run in Supabase SQL editor
├── types/
│   └── index.ts                  # TypeScript types
├── .github/workflows/
│   ├── crawl.yml                 # Daily crawl (06:00 UTC)
│   └── cleanup.yml               # Weekly cleanup (Sun 03:00 UTC)
├── .env.example                  # Copy to .env.local
└── README.md
```

## Data Sources (Phase 1)

| Source | Type | Country focus |
|---|---|---|
| SHED MoEdu Bangladesh | Govt portal | BD nationals → abroad |
| EURAXESS | Academic jobs | EU research |
| DAAD | Scholarships | Germany |
| OpportunityDesk | Aggregator | Global |
| The Daily Star BD | News portal | BD-focused |
| scholars4dev | Aggregator | Developing countries |

## Roadmap

- **Phase 1 (now):** 6 scrapers, basic UI, AI extraction, Pinecone search
- **Phase 2:** +10 scrapers, Supabase Auth, user profiles, personalised feed
- **Phase 3:** RAG streaming chat, bookmarks, deadline alerts, Telegram bot
- **Phase 4:** Community submissions, scam detection, PWA
- **Phase 5:** Freemium, Stripe, institution API, Product Hunt launch

## Upgrade Triggers

| Trigger | Action | Cost |
|---|---|---|
| DB > 500MB | Supabase Free → Pro | $25/mo |
| Vectors > 100k | Pinecone Free → Starter | $70/mo |
| Email > 300/day | Brevo Free → Starter | $9/mo |
| 500+ daily users | Vercel Free → Pro or VPS | $20/mo |
