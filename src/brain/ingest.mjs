// THE BRAIN — ingest Persistence's own content into a retrievable knowledge base.
// Keyless: pulls the sitemap, fetches each page, chunks the text, and builds a
// BM25 index. No embedding API required for the prototype.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getText, htmlToText } from '../lib/fetch.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const BRAIN_PATH = join(ROOT, '../../data/brain.json');
const SITE = 'https://persistence.dev';

const STOP = new Set('a an the and or but of to in on for with is are be as at by from this that it its our we you your can how what why not just they their than'.split(' '));
export const tokenize = (s) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

function chunk(text, url, title, size = 900) {
  const words = text.split(' ');
  const out = [];
  for (let i = 0; i < words.length; i += size) {
    const body = words.slice(i, i + size).join(' ');
    if (body.length > 120) out.push({ url, title, text: body });
  }
  return out;
}

async function urlsFromSitemap() {
  const xml = await getText(`${SITE}/sitemap-0.xml`, { ttlHours: 12 });
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

export async function ingest({ log = console.log } = {}) {
  log('🧠  Building the Persistence brain');
  const urls = await urlsFromSitemap();
  log(`    sitemap: ${urls.length} URLs`);
  const posts = urls.filter((u) => u.includes('/resources/blog/') && !u.endsWith('/blog/'));
  log(`    blog posts: ${posts.length}  ·  other pages: ${urls.length - posts.length}`);

  const chunks = [];
  const pages = [];
  let done = 0;
  for (const url of urls) {
    if (url.match(/\/(cookies|privacy|data-deletion)\//)) continue; // skip legal boilerplate
    try {
      const html = await getText(url, { ttlHours: 168 });
      const title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] || url).replace(/\s*\|\s*Persistence.*$/i, '').trim();
      const text = htmlToText(html);
      const isPost = url.includes('/resources/blog/');
      pages.push({ url, title, isPost, slug: url.replace(/\/$/, '').split('/').pop(), words: text.split(' ').length });
      chunks.push(...chunk(text, url, title));
      if (++done % 10 === 0) log(`    ingested ${done}/${urls.length}…`);
    } catch (e) {
      log(`    ⚠ skip ${url} (${e.message})`);
    }
  }

  // BM25 document-frequency table over chunks.
  const df = new Map();
  const docs = chunks.map((c) => {
    const toks = tokenize(c.text);
    const tf = new Map();
    for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
    for (const t of new Set(toks)) df.set(t, (df.get(t) || 0) + 1);
    return { ...c, tf: Object.fromEntries(tf), len: toks.length };
  });
  const avgLen = docs.reduce((a, d) => a + d.len, 0) / (docs.length || 1);

  const brain = {
    builtAt: new Date().toISOString(),
    site: SITE,
    stats: { pages: pages.length, posts: posts.length, chunks: docs.length },
    pages,
    df: Object.fromEntries(df),
    N: docs.length,
    avgLen,
    docs,
  };
  await writeFile(BRAIN_PATH, JSON.stringify(brain));
  log(`✅  Brain ready: ${pages.length} pages, ${docs.length} chunks → data/brain.json`);
  return brain;
}
