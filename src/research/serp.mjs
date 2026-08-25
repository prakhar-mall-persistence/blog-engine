// SERP + competitor discovery via DuckDuckGo HTML (free, keyless). Extracts
// ranking URLs, titles, snippets, and rolls them up into a competitor profile.
import { getText } from '../lib/fetch.mjs';

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<\/?b>/g, '');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parse(html) {
  const results = [];
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) && results.length < 12) {
    let href = m[1];
    const uddg = href.match(/uddg=([^&]+)/);
    if (uddg) href = decode(decodeURIComponent(uddg[1]));
    if (!href.startsWith('http')) continue;
    try { results.push({ rank: results.length + 1, url: href, title: decode(m[2].replace(/<[^>]+>/g, '').trim()), domain: new URL(href).hostname.replace(/^www\./, '') }); } catch {}
  }
  const snips = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)].map((s) => decode(s[1].replace(/<[^>]+>/g, '').trim()));
  results.forEach((r, i) => (r.snippet = snips[i] || ''));
  return results;
}

// Google SERP via Serper.dev — the reliable path. Free tier = 2,500 queries,
// so it stays "free to start" while removing the keyless rate-limit ceiling.
async function serper(query) {
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, num: 12 }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`serper HTTP ${res.status}`);
  const data = await res.json();
  const out = (data.organic || []).slice(0, 12).map((o, i) => {
    let domain = ''; try { domain = new URL(o.link).hostname.replace(/^www\./, ''); } catch {}
    return { rank: i + 1, url: o.link, title: o.title || '', domain, snippet: o.snippet || '' };
  }).filter((r) => r.domain);
  // Serper also returns the actual AI/answer boxes — gold for AEO.
  out.answerBox = data.answerBox || null;
  out.peopleAlsoAsk = (data.peopleAlsoAsk || []).map((p) => p.question);
  return out;
}

// SERP with automatic source selection: Serper.dev when keyed (reliable),
// else keyless DuckDuckGo HTML (rate-limits on bursts). Returns the array with
// `.blocked` set so callers can tell "nobody ranks" from "we got throttled".
export async function serp(query, { log = () => {} } = {}) {
  if (process.env.SERPER_API_KEY) {
    try {
      const results = await serper(query);
      results.blocked = false;
      log(`🔎  SERP "${query}": ${results.length} results (serper)`);
      return results;
    } catch (e) {
      log(`🔎  SERP "${query}": serper failed (${e.message}), falling back to keyless`);
    }
  }
  const ddg = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  let results = parse(await getText(ddg, { ttlHours: 48, politeMs: 1000 }));
  for (let attempt = 0; results.length === 0 && attempt < 2; attempt++) {
    await sleep(3000 * (attempt + 1));
    results = parse(await getText(ddg, { ttlHours: 48, fresh: true, politeMs: 1000 }));
  }
  const blocked = results.length === 0;
  log(`🔎  SERP "${query}": ${blocked ? 'rate-limited (add SERPER_API_KEY — free tier)' : results.length + ' results'}`);
  results.blocked = blocked;
  return results;
}

// Search engines, aggregators and generic platforms — not competitors.
const NON_COMPETITORS = /(^|\.)(duckduckgo|google|bing|yahoo|youtube|wikipedia|reddit|linkedin|facebook|twitter|x|medium|quora|g2|capterra|gartner|trustpilot)\.(com|org|net|co)$/;

// Aggregate several SERPs into a competitor / share-of-voice profile.
export async function competitorProfile(queries, ownDomain, { log = () => {} } = {}) {
  const domains = new Map();
  const perQuery = [];
  for (const q of queries) {
    const r = await serp(q, { log });
    perQuery.push({ query: q, top: r.slice(0, 5) });
    r.forEach((res) => {
      if (NON_COMPETITORS.test(res.domain)) return;
      const d = domains.get(res.domain) || { domain: res.domain, appearances: 0, bestRank: 99, queries: [] };
      d.appearances++; d.bestRank = Math.min(d.bestRank, res.rank); d.queries.push(q);
      domains.set(res.domain, d);
    });
  }
  const ranked = [...domains.values()].sort((a, b) => b.appearances - a.appearances || a.bestRank - b.bestRank);
  const own = ranked.find((d) => d.domain.includes(ownDomain));
  return {
    competitors: ranked.filter((d) => !d.domain.includes(ownDomain)).slice(0, 10),
    ownPresence: own ? { appearances: own.appearances, bestRank: own.bestRank, ofQueries: queries.length } : null,
    perQuery,
  };
}
