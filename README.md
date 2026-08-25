# Persistence Blog Engine

Research-to-publish system for the Persistence blog. This repo is **Phase 1: the
brain + a keyless research prototype** — the hardest part, proven first.

Everything here runs on **free, keyless data sources** (Google Autocomplete,
DuckDuckGo SERP, the live persistence.dev sitemap). Paid keyword APIs and the
LLM reasoning/writer layer plug in behind the same interfaces without changing
anything downstream.

## What's built

| Stage | Module | Status |
|---|---|---|
| **Brain** — ingest persistence.dev into a retrievable KB | `src/brain/*` | ✅ working |
| **Keywords** — autocomplete expansion + intent + clusters | `src/research/keywords.mjs` | ✅ working |
| **Competitors** — SERP scrape + share-of-voice | `src/research/serp.mjs` | ✅ working |
| **Gaps** — vs the existing published posts | `src/research/gap.mjs` | ✅ working |
| **AEO/GEO** — question mining + citation probe + readiness audit | `src/research/aeo.mjs` | ✅ working |
| **Answer-engine providers** — Perplexity / Serper / (Anthropic·OpenAI reserved) | `src/lib/llm.mjs` | ✅ working |
| **Orchestrator** — topic → transparent brief | `src/engine.mjs` | ✅ working |
| **Writer** — brief-pack → validated `Post` + FAQ JSON-LD + preview | `src/writer/*` | ✅ working |
| **Graphics** — on-brand SVG (flow / fit-matrix / stats / hero) | `src/writer/graphics.mjs` | ✅ working |
| **Redesign** — article template + blog index in the live design system | `src/writer/preview.mjs`, `index-preview.mjs` | ✅ working |
| **Publish** — Post → PR against astro-web (dry-run by default) | `src/publish/github.mjs` | ✅ working |
| **Slack gate** — Block Kit approval card (Approve/Reject) | `src/publish/slack.mjs` | ✅ working |
| **Service + n8n** — HTTP API + importable orchestration workflow | `src/server.mjs`, `n8n/` | ✅ working |

## Optional API keys (all have free tiers; none required to run)

Keys load automatically from a gitignored `.env` (copy `.env.example` → `.env`).
The engine runs fully keyless. Adding a key upgrades specific stages:

| Env var | Unlocks | Free tier |
|---|---|---|
| `SERPER_API_KEY` | Reliable Google SERP for the **competitor** + **AEO citation** stages (removes the keyless rate-limit ceiling) | 2,500 queries |
| `PERPLEXITY_API_KEY` | **Live** answer-engine check — actually asks Perplexity the questions and reads back real citations | pay-as-you-go, cheap |
| `ANTHROPIC_API_KEY` | Sharper LLM clustering + (reserved) live probe + the Phase 2 writer | — |

```bash
export SERPER_API_KEY=...      # then re-run; competitor + AEO go reliable
```

### The keyless SERP ceiling (important)

The brain, keyword, gap, question-mining and AEO-readiness stages are keyless
**and reliable at any volume**. The **competitor** and **AEO citation-set**
stages scrape DuckDuckGo, which rate-limits your IP after a burst of queries —
fine for a demo, not for repeated runs. A `SERPER_API_KEY` (free 2,500 tier)
removes this entirely and is the recommended first upgrade.

## Usage

```bash
npm run ingest                                # build the brain (data/brain.json)
npm run research -- "voice ai for insurance"  # transparent research pass → output/brief-*.md
npm run write    -- "voice ai for insurance"  # research (if needed) → writer pack
npm run index                                 # render the redesigned blog index from posts.ts + drafts
npm run publish -- "voice ai for insurance"    # DRY-RUN publish (add --pr to open a real PR)
npm run serve                                  # HTTP service for n8n (POST /write, /publish, …)
```

Phase 4 automation (n8n + Slack approval → PR → deploy) is documented in
[docs/PHASE4_AUTOMATION.md](docs/PHASE4_AUTOMATION.md); the importable workflow
is `n8n/persistence-blog-engine.workflow.json`.

The writer produces, per post: a validated `Post` object (`*.json`), a pasteable
`src/data/posts.ts` entry (`*.posts-entry.ts`), FAQPage JSON-LD (`*.faq.jsonld`),
and a self-contained HTML **approval preview** (`*.preview.html`).

- **With `ANTHROPIC_API_KEY`:** `npm run write` drafts the post automatically.
- **Without a key:** it emits the brief-pack + the exact writer prompt; the draft
  is produced in-session (or by hand) as `output/draft-<slug>.json`, then
  `finalize` assembles + validates it. Same contract either way.

Output lands in `output/brief-<topic>.md` (human-readable) and `.json` (for the
next stage). Every step logs what it's doing and why.

## Design notes

- **Keyless by design.** No API key needed to run the whole prototype today.
- **The brain uses BM25**, not embeddings — good enough for grounding, zero cost,
  swap in pgvector later.
- **Reasoning layer** (clustering/intent) is currently rule-based heuristics;
  the LLM version drops in via `ANTHROPIC_API_KEY` for sharper clusters + AEO.
- **Publish target** is the existing `persistence-dev/website` pipeline on the
  `astro-web` branch — the writer emits the `Post` shape from `src/data/posts.ts`.

## Caching

All fetches cache to `data/cache/` (24h–7d TTLs) so repeated runs are fast and
polite to the sources.
