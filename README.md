# Hard Problem

An open-source learning platform where STEM professionals develop philosophical thinking skills through structured engagement with real academic papers on technology ethics.

**Live at [hardproblem.club](https://hardproblem.club)**

Hard Problem is *not* a philosophy course delivered to STEM people. It is a STEM-native experience — using humanities tools, grounded in authoritative sources, and structured around peer collaboration.

## What's different

Most "tech ethics" content sits at one of two extremes: shallow op-eds (you finish in five minutes and have learned nothing rigorous) or full academic philosophy papers (you bounce off in five minutes because nothing is structured for someone outside the field).

Hard Problem is structured around the assumption that the reader is technically literate, time-constrained, and skeptical of hand-waving. Each topic unit centers on:

- **A focal paper** — a real, contemporary academic paper on a technology ethics question (manipulation, AI alignment, surveillance, content moderation, etc.)
- **A counter-reading** that genuinely disagrees with the focal paper, so you see the live debate rather than a settled answer
- **A real-world anchor** — the actual product, incident, or policy decision the philosophy is responding to
- **A structured discussion space** where readers post arguments, build on each other's reasoning, and surface assumptions

An optional **AI Reasoning Partner** (subscriber feature) is grounded in the source material via section-aware RAG. It's tuned to refine your arguments and surface counter-examples — not to do your thinking for you.

## Features

### Reading & comprehension
- Embedded PDF viewer (PDF.js) for the focal paper — read the actual primary source, not a watered-down summary
- Section-aware chunking so AI conversations stay grounded in cited passages
- Counter-reading view alongside the focal paper

### Reasoning Partner (AI)
- Anthropic Claude or OpenAI, server-side
- RAG over the focal paper's text using pgvector embeddings
- Conversation tone tuned for argumentation, not summarization
- Free tier and Pro subscription via Stripe

### Discussion
- Post arguments threaded under topic units
- "Build on" replies for explicitly extending another reader's reasoning
- Stance tags (agree / disagree / refine / question) to surface the structure of the debate
- Editorial seed contributions to bootstrap conversation on new topics

### Quiz / progress
- Lightweight checks for understanding before contributing
- Progress tracking across topic units

### Admin
- Topic and paper management
- Embedding pipeline (Docling + pgvector) for new papers
- Editorial workflow for seed contributions

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript |
| API | tRPC |
| Database | Supabase (PostgreSQL, Auth, RLS, Storage) |
| Vector DB | pgvector (Supabase extension) |
| Payments | Stripe (subscriptions) |
| AI | Anthropic Claude, OpenAI (server-side) |
| PDF | PDF.js |
| PDF extraction | Docling (Python) |
| State | Zustand |
| Deployment | Vercel |

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.10+ (for paper extraction/embedding pipeline)
- A Supabase project with the `pgvector` extension enabled
- A Stripe account (for subscriptions)
- An Anthropic and/or OpenAI API key

### Environment Variables

Copy `.env.local.example` to `.env.local` and fill in:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRO_PRICE_ID=

# AI providers (server-side only — never NEXT_PUBLIC_)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# App
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### Setup

```bash
# Install dependencies (note: --legacy-peer-deps for openai v4 / zod v4 conflict)
npm install --legacy-peer-deps

# Run database migrations in supabase/migrations/ via the Supabase dashboard or CLI

# Optional: seed sample topics, papers, and discussion content
npx tsx scripts/seed-content.ts

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Adding a new paper

```bash
# 1. Drop the PDF into scripts/pdfs/
# 2. Extract text with Docling and chunk it
pip install -r scripts/requirements.txt
python scripts/extract_and_embed.py path/to/paper.pdf
```

This extracts text section-by-section, chunks it for RAG, generates embeddings, and inserts everything into Supabase.

### Stripe Setup

1. Create a recurring price in the Stripe Dashboard
2. Set `STRIPE_PRO_PRICE_ID` to the price ID
3. Set up a webhook pointing to `https://your-domain/api/stripe/webhook`
4. Listen for: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
5. Set `STRIPE_WEBHOOK_SECRET` from the webhook signing secret

## Project Structure

```
src/
  app/
    api/
      admin/embed-paper/    # Trigger embedding pipeline for a new paper
      stripe/               # Checkout, billing portal, webhook
      trpc/                 # tRPC handler
    admin/                  # Topic/paper management, editorial workflow
    auth/                   # Login, signup, OAuth callback
    concepts/               # Concept reference pages
    notifications/
    profile/
    settings/               # Subscription management
    topics/[slug]/          # Topic unit (focal paper + counter + discussion)
    upgrade/                # Subscription upsell
  components/               # Reader, AI chat, discussion, layout
  lib/
    trpc/routers/           # papers, topics, ai, concepts, contributions,
                            # quiz, progress, profile, notifications, admin
    supabase/               # Browser/server clients
  stores/                   # Zustand
scripts/
  extract_and_embed.py      # Python: Docling extraction → chunks → embeddings
  seed-content.ts           # Seed topics, papers, contributions
  seed-expansion.ts         # Expand seed discussions
  seed-videos.ts
supabase/migrations/        # PostgreSQL schema, pgvector setup, RLS policies
```

## Contributing

Issues and pull requests welcome.

Especially welcome:
- New topic units (focal paper + counter + real-world anchor)
- Improvements to the reasoning prompts (`src/lib/trpc/routers/ai.ts`)
- Better extraction heuristics in `scripts/extract_and_embed.py`

## License

MIT — see [LICENSE](LICENSE).

Built by [Camus Technology](https://camus.tech).
