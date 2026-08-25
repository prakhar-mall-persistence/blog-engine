# Phase 4 — automation + Slack approval gate

The engine can now run itself on a schedule, ask a human to approve each draft
in Slack, and publish on ✅ by opening a PR against `astro-web`. n8n is the
orchestrator; the engine does the thinking.

```
                        ┌──────────── DRAFTING (scheduled) ────────────┐
  n8n Schedule (Tue 9am)
        │
        ▼
  Pick topic  ──POST /write──▶  Blog Engine service
                                  research (Serper) → Claude draft →
                                  preview + posts.ts entry →
                                  posts Slack approval card
                                          │
        ┌──────────── APPROVAL (event) ───┘
        ▼
  Slack: [✅ Approve & publish] [✕ Reject] [Open preview]
        │  (button click)
        ▼
  n8n Webhook  ──POST /publish {slug}──▶  Blog Engine service
                                            opens PR against astro-web
        │                                         │
        ▼                                         ▼
  Ack back to Slack ◀───────────────────  merge PR → existing
  "✅ PR opened: …"                        build + deploy → live
```

## Why a PR, not a direct push

Merging the PR is the deploy trigger, and a PR is reviewable and revertible.
The Slack approval is the *first* gate (is this worth publishing?); the PR merge
is the *second* (does the rendered page look right?). Either can be automated
later, but both exist by default.

## Setup

1. **Run the engine service** where n8n can reach it:
   ```bash
   npm run serve            # http://localhost:8788  (set PUBLIC_BASE_URL if remote)
   ```
2. **Slack app**: create a bot, add `chat:write`, invite it to the channel
   (`/invite @your-bot`), set `SLACK_BOT_TOKEN` + `SLACK_CHANNEL` (a channel
   **ID**, e.g. `C0…`). Enable **Interactivity** and point its Request URL at
   the n8n webhook (`.../webhook/blog-approval`) to activate the buttons.
2b. **Email (optional)**: set `EMAIL_TO` and a provider — `RESEND_API_KEY`
   (verify your domain at resend.com/domains to send from `@persistence.dev`;
   until then it falls back to `onboarding@resend.dev`) or a `MAILER_URL`.
   The `/write` endpoint sends both Slack + email when called with `notify:true`.
3. **GitHub**: fine-grained token (Contents + Pull requests: write on
   `persistence-dev/website`) → `GITHUB_TOKEN`.
4. **n8n**: import `n8n/persistence-blog-engine.workflow.json`, set the
   `ENGINE_BASE_URL` env var, activate. Replace the "Pick topic" node with your
   real topic queue (a Google Sheet / Notion / the gap list from a research run).

## Endpoints (for n8n or manual use)

| Method | Route | Does |
|---|---|---|
| POST | `/research` `{topic}` | transparent research brief |
| POST | `/write` `{topic, notifySlack?}` | research → draft → preview (+ optional Slack card) |
| POST | `/publish` `{slug, mode}` | `dry` renders the entry; `live` opens the PR |
| GET | `/preview/:slug` | the article preview HTML |
| GET | `/blog-index` | the redesigned index |

## Manual path (no n8n)

```bash
npm run write   -- "voice ai for insurance"          # draft + preview
npm run publish -- "voice ai for insurance"          # DRY-RUN (safe)
npm run publish -- "voice ai for insurance" --pr     # open the PR
npm run publish -- "voice ai for insurance" --slack  # also post the Slack card
```

## Safety

- `publish` is **dry-run by default**; `--pr` (or `mode:"live"`) is required to
  touch the repo, and even then it opens a PR rather than pushing to `astro-web`.
- The engine never duplicate-publishes: if the slug already exists in
  `posts.ts`, publish aborts.
