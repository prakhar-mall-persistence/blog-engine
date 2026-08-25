// Publish a finished Post to the website by inserting its posts.ts entry and
// opening a PR against the astro-web branch (where the blog lives). Safe by
// default: dry-run computes and writes the diff locally; --pr actually opens it.
//
// Needs GITHUB_TOKEN (repo scope) only for the live path. The PR — not a direct
// push — is the human gate: merging it triggers the existing build+deploy.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { toPostsTsEntry } from '../writer/schema.mjs';

const pexec = promisify(execFile);
// `gh` prefers the GITHUB_TOKEN env var over its keyring auth — so when we fall
// back to the CLI we must run it WITHOUT that var, or a bad PAT poisons it.
const GH_ENV = (() => { const e = { ...process.env }; delete e.GITHUB_TOKEN; delete e.GH_TOKEN; return e; })();
const ghExec = (args) => pexec('gh', args, { env: GH_ENV, maxBuffer: 20 * 1024 * 1024 });
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../output');
const REPO = 'persistence-dev/website';
const BRANCH = 'astro-web';
const FILE = 'src/data/posts.ts';
const API = 'https://api.github.com';

// Backend resolution: prefer GITHUB_TOKEN when it can actually reach the repo
// (standalone/n8n path); otherwise fall back to the `gh` CLI (local dev path).
let _backend = null;
async function backend() {
  if (_backend) return _backend;
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    const ok = await fetch(`${API}/repos/${REPO}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }).then((r) => r.ok).catch(() => false);
    if (ok) return (_backend = 'token');
  }
  // gh CLI fallback (keyring auth, GITHUB_TOKEN stripped from its env)
  try { await ghExec(['api', `repos/${REPO}`, '--jq', '.id']); return (_backend = 'gh'); } catch {}
  throw new Error('No GitHub access: GITHUB_TOKEN lacks access to ' + REPO + ' and `gh` CLI is not authenticated for it.');
}

// Unified request over whichever backend is available.
async function gh(path, opts = {}) {
  const be = await backend();
  if (be === 'token') {
    const r = await fetch(`${API}${path}`, { ...opts, headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', ...opts.headers } });
    if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }
  // gh CLI: mirror the REST call through `gh api`. Bodies go via a temp file
  // (--input) so large payloads (posts.ts is ~400KB) never hit the arg limit.
  const args = ['api', path.replace(/^\//, '')];
  if (opts.method && opts.method !== 'GET') args.push('-X', opts.method);
  let tmp;
  if (opts.body) {
    tmp = join(OUT, `.ghreq-${Date.now()}.json`);
    await writeFile(tmp, opts.body);
    args.push('--input', tmp);
  }
  try {
    const { stdout } = await ghExec(args);
    return JSON.parse(stdout);
  } finally {
    if (tmp) await import('node:fs/promises').then((fs) => fs.unlink(tmp)).catch(() => {});
  }
}

export async function whichBackend() { try { return await backend(); } catch (e) { return `none (${e.message})`; } }

// Insert the entry newest-first, right after the array opener. Returns null if
// the slug already exists (never duplicate-publish).
export function insertEntry(source, post) {
  if (source.includes(`slug: '${post.slug}'`) || source.includes(`slug: "${post.slug}"`)) return null;
  const anchor = source.match(/export const posts:\s*Post\[\]\s*=\s*\[\s*\n/);
  if (!anchor) throw new Error('Could not find `export const posts: Post[] = [` in posts.ts');
  const at = anchor.index + anchor[0].length;
  return source.slice(0, at) + toPostsTsEntry(post) + '\n' + source.slice(at);
}

export async function publish(post, { mode = 'dry', log = console.log } = {}) {
  log(`📤  Publish "${post.title}" (slug: ${post.slug}) — mode: ${mode}`);

  if (mode === 'dry') {
    // Fetch current posts.ts via the public gh CLI path isn't available here;
    // in dry-run we just render the entry + a local preview of the insertion.
    const entry = toPostsTsEntry(post);
    await writeFile(join(OUT, `publish-${post.slug}.entry.ts`), entry + '\n');
    log('    DRY RUN — no repo changes. Wrote the posts.ts entry to output/.');
    log(`    Live run would: branch blog/${post.slug} → insert entry → open PR to ${BRANCH}.`);
    return { mode: 'dry', slug: post.slug };
  }

  // LIVE: branch → update file → PR.
  const headRef = await gh(`/repos/${REPO}/git/ref/heads/${BRANCH}`);
  const baseSha = headRef.object.sha;
  const newBranch = `blog/${post.slug}`;
  await gh(`/repos/${REPO}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha: baseSha }) })
    .catch((e) => { if (!/Reference already exists/.test(e.message)) throw e; });

  const current = await gh(`/repos/${REPO}/contents/${FILE}?ref=${newBranch}`);
  const source = Buffer.from(current.content, 'base64').toString('utf8');
  const updated = insertEntry(source, post);
  if (!updated) { log(`    ⚠ slug "${post.slug}" already exists — aborting.`); return { skipped: true }; }

  await gh(`/repos/${REPO}/contents/${FILE}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `blog: add "${post.title}"`,
      content: Buffer.from(updated).toString('base64'),
      sha: current.sha,
      branch: newBranch,
    }),
  });
  const pr = await gh(`/repos/${REPO}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title: `Blog: ${post.title}`,
      head: newBranch,
      base: BRANCH,
      body: `Auto-drafted by the Persistence Blog Engine.\n\n- **slug**: \`${post.slug}\`\n- **category**: ${post.category} · **tag**: ${post.tag}\n- **SEO title**: ${post.seoTitle || post.title}\n\n${post.description}\n\nReview and merge to deploy.`,
    }),
  });
  log(`    ✅ PR opened: ${pr.html_url}`);
  return { mode: 'live', prUrl: pr.html_url, branch: newBranch };
}
