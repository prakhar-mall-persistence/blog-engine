# Running Matrix (no n8n)

You drive the engine directly. Two ways to use it — pick per task.

## A. Just the CLIs (simplest — no server needed)

From the `blog-engine/` (or `matrix/`) folder, with `.env` filled in:

```bash
npm run write   -- "voice ai for insurance"   # research → Claude draft → preview + Slack card + email
npm run publish -- "voice ai for insurance" --pr   # open the PR on website (astro-web)
npm run index                                   # rebuild the redesigned blog index
```

`write` drafts and (with your keys) posts the Slack approval card and emails you.
You "approve" by reviewing and merging the PR — merging triggers the existing
build + deploy. That's the whole loop, no orchestrator.

To also notify on the `write` step, it already does (Slack + email) because the
keys are in `.env`. To skip notifying, unset the keys or use the plain CLI.

## B. Keep the HTTP service running (for shareable preview URLs / automation)

The service serves previews and exposes `/write`, `/publish`, `/preview/:slug`.

### Run it persistently with pm2 (easiest)
```bash
npm i -g pm2
pm2 start "npm run serve" --name matrix --cwd "/Users/prakhar/prakhar personal/blog-engine"
pm2 save
pm2 logs matrix          # watch it
```

### …or survive reboots with launchd (native macOS)
Create `~/Library/LaunchAgents/dev.persistence.matrix.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>dev.persistence.matrix</string>
  <key>WorkingDirectory</key><string>/Users/prakhar/prakhar personal/blog-engine</string>
  <key>ProgramArguments</key>
    <array><string>/usr/bin/env</string><string>npm</string><string>run</string><string>serve</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/matrix.log</string>
  <key>StandardErrorPath</key><string>/tmp/matrix.err</string>
</dict></plist>
```
```bash
launchctl load ~/Library/LaunchAgents/dev.persistence.matrix.plist
curl -s localhost:8788/health
```

Then drive it:
```bash
curl -s -X POST localhost:8788/write   -H 'Content-Type: application/json' -d '{"topic":"voice ai for insurance","notify":true}'
curl -s -X POST localhost:8788/publish -H 'Content-Type: application/json' -d '{"slug":"voice-ai-for-insurance","mode":"live"}'
open http://localhost:8788/preview/voice-ai-for-insurance
```

## C. (Optional) Schedule drafts without n8n — plain cron

To auto-draft one topic every Tuesday 9am (approval still gates publish):
```bash
crontab -e
# m h dom mon dow  command
  0 9 * * 2  cd "/Users/prakhar/prakhar personal/blog-engine" && /usr/bin/env npm run write -- "$(head -1 topics.txt)" >> /tmp/matrix-cron.log 2>&1
```
Keep a `topics.txt` queue (one topic per line); or point it at the gap list from
`npm run research`. Each run drafts + notifies; you approve by merging the PR.

## Notes
- Keys load from `.env` automatically. Never commit it (already gitignored).
- Publishing uses the org PAT when present, else your `gh` login.
- The service binds `localhost:8788`. Change with `PORT` / `PUBLIC_BASE_URL`.
