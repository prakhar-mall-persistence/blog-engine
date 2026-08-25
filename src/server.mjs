// HTTP service exposing the engine to n8n (or anything). Zero-dependency Node
// http. Endpoints:
//   GET  /health
//   POST /research   {topic}                → research brief
//   POST /write      {topic}                → {post, faq, previewUrl} (research if needed)
//   POST /approve    {slug, mode?}          → Slack-approved → publish (PR)
//   POST /publish    {slug, mode?}          → publish a finalized post
//   GET  /preview/:slug                     → the article preview HTML
//   GET  /blog-index                        → the redesigned index HTML
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { research } from './engine.mjs';
import { buildPack } from './writer/brief-pack.mjs';
import { write } from './writer/write.mjs';
import { publish } from './publish/github.mjs';
import { requestApproval } from './publish/slack.mjs';
import { emailApproval } from './publish/email.mjs';
import { slugify } from './writer/schema.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../output');
const PORT = process.env.PORT || 8788;
const BASE = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;

const body = (req) => new Promise((res) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => { try { res(d ? JSON.parse(d) : {}); } catch { res({}); } }); });
const json = (r, code, obj) => { r.writeHead(code, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(obj)); };
const loadPost = async (slug) => { const f = join(OUT, `post-${slug}.json`); return existsSync(f) ? JSON.parse(await readFile(f, 'utf8')) : null; };

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, BASE);
    const path = url.pathname;

    if (path === '/health') return json(res, 200, { ok: true, base: BASE });

    if (path === '/' || path === '/dashboard') {
      const f = join(dirname(fileURLToPath(import.meta.url)), 'dashboard.html');
      res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(await readFile(f));
    }
    if (path === '/state') {
      const files = existsSync(OUT) ? await readdir(OUT) : [];
      const withTime = async (name) => ({ name, mtime: (await stat(join(OUT, name))).mtime.toISOString() });
      const briefs = await Promise.all(files.filter((f) => f.startsWith('brief-') && f.endsWith('.json')).map(withTime));
      const posts = [];
      for (const f of files.filter((n) => n.startsWith('post-') && n.endsWith('.json'))) {
        const slug = f.slice(5, -5);
        const data = JSON.parse(await readFile(join(OUT, f), 'utf8'));
        posts.push({ slug, title: data.post?.title || slug, mtime: (await stat(join(OUT, f))).mtime.toISOString(), hasPreview: files.includes(`post-${slug}.preview.html`) });
      }
      briefs.sort((a, b) => b.mtime.localeCompare(a.mtime)); posts.sort((a, b) => b.mtime.localeCompare(a.mtime));
      return json(res, 200, { briefs, posts });
    }

    if (path.startsWith('/preview/')) {
      const f = join(OUT, `post-${path.slice(9)}.preview.html`);
      if (!existsSync(f)) return json(res, 404, { error: 'no preview' });
      res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(await readFile(f));
    }
    if (path === '/blog-index') {
      const f = join(OUT, 'blog-index.preview.html');
      if (!existsSync(f)) return json(res, 404, { error: 'run /write or npm run index first' });
      res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(await readFile(f));
    }

    if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
    const b = await body(req);

    if (path === '/research') {
      if (!b.topic) return json(res, 400, { error: 'topic required' });
      const { brief } = await research(b.topic);
      return json(res, 200, { brief });
    }
    if (path === '/write') {
      if (!b.topic) return json(res, 400, { error: 'topic required' });
      const briefPath = join(OUT, `brief-${slugify(b.topic)}.json`);
      const brief = existsSync(briefPath) ? JSON.parse(await readFile(briefPath, 'utf8')) : (await research(b.topic)).brief;
      const pack = await buildPack(b.topic, { brief });
      const result = await write(pack);
      if (result.needsDraft) return json(res, 202, { needsDraft: true, note: 'No ANTHROPIC_API_KEY — draft manually then POST /publish' });
      const previewUrl = `${BASE}/preview/${result.post.slug}`;
      // Notify the approvers (Slack card + email) if asked. Never fail the draft
      // just because a notifier is misconfigured.
      const notify = {};
      if (b.notify || b.notifySlack) notify.slack = await requestApproval(result.post, { previewUrl, mode: b.slackMode || 'live' }).catch((e) => ({ error: e.message }));
      if (b.notify || b.notifyEmail) notify.email = await emailApproval(result.post, { prUrl: b.prUrl || previewUrl }).catch((e) => ({ error: e.message }));
      return json(res, 200, { post: result.post, faq: result.faq, previewUrl, notify });
    }
    if (path === '/approve' || path === '/publish') {
      const data = await loadPost(b.slug);
      if (!data) return json(res, 404, { error: `no drafted post for slug ${b.slug}` });
      const out = await publish(data.post, { mode: b.mode || 'dry' });
      return json(res, 200, out);
    }
    return json(res, 404, { error: 'unknown route' });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => console.log(`🌐  Blog engine service on ${BASE}`));
