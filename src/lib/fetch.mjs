// Polite, cached HTTP with retry. Keyless — used by every data source.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../data/cache');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function key(url, opts = {}) {
  return createHash('sha1').update(url + (opts.body || '')).digest('hex').slice(0, 16);
}

// Fetch text with on-disk cache (default 24h) so repeated runs don't re-hit sources.
export async function getText(url, { ttlHours = 24, headers = {}, retries = 2, fresh = false, politeMs = 400 } = {}) {
  if (!existsSync(CACHE_DIR)) await mkdir(CACHE_DIR, { recursive: true });
  const cacheFile = join(CACHE_DIR, key(url) + '.txt');
  if (!fresh && existsSync(cacheFile)) {
    const stat = await readFile(cacheFile, 'utf8').then((s) => JSON.parse(s)).catch(() => null);
    if (stat && Date.now() - stat.t < ttlHours * 3600e3) return stat.body;
  }
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.text();
      await writeFile(cacheFile, JSON.stringify({ t: Date.now(), body }));
      await sleep(politeMs); // be polite
      return body;
    } catch (e) {
      lastErr = e;
      await sleep(600 * (i + 1));
    }
  }
  throw new Error(`fetch failed ${url}: ${lastErr?.message}`);
}

export async function getJSON(url, opts) {
  return JSON.parse(await getText(url, opts));
}

// Crude but adequate HTML → text for prototype ingestion.
export function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"').replace(/&mdash;/g, '—').replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
