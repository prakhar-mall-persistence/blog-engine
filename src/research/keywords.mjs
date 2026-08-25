// Keyword expansion via Google Autocomplete (free, keyless) + heuristic intent
// classification. "Alphabet soup" expansion mines long-tail + question queries.
import { getJSON } from '../lib/fetch.mjs';

const AC = (q) => `https://suggestqueries.google.com/complete/search?client=firefox&hl=en&q=${encodeURIComponent(q)}`;
const MODIFIERS = ['', 'how', 'what', 'why', 'best', 'vs', 'cost', 'pricing', 'alternative', 'for'];
const QUESTIONS = ['how', 'what', 'why', 'can', 'does', 'is', 'when', 'which'];

async function suggest(q) {
  try {
    const data = await getJSON(AC(q), { ttlHours: 72 });
    return data[1] || [];
  } catch { return []; }
}

// Classify search intent from the phrasing — rule-based, no LLM needed.
export function classifyIntent(kw) {
  const k = kw.toLowerCase();
  if (/\b(vs|versus|alternative|alternatives|best|top|review|comparison|compare)\b/.test(k)) return 'commercial';
  if (/\b(pricing|price|cost|cheap|buy|free|trial|demo|quote)\b/.test(k)) return 'transactional';
  if (QUESTIONS.some((w) => k.startsWith(w + ' ')) || /\b(how|what|why|guide|tutorial|examples?)\b/.test(k)) return 'informational';
  return 'informational';
}

export async function expandKeywords(seed, { log = () => {} } = {}) {
  log(`🔑  Expanding "${seed}" via Google Autocomplete (${MODIFIERS.length} modifiers)`);
  const seen = new Map(); // kw -> {kw, intent, seedFrom}
  const add = (kw, from) => {
    const clean = kw.trim().toLowerCase();
    if (clean && !seen.has(clean)) seen.set(clean, { kw: clean, intent: classifyIntent(clean), from });
  };
  add(seed, 'seed');

  for (const mod of MODIFIERS) {
    const query = mod === '' ? seed : (['how', 'what', 'why'].includes(mod) ? `${mod} ${seed}` : `${seed} ${mod}`);
    for (const s of await suggest(query)) add(s, query);
  }
  const list = [...seen.values()];
  const byIntent = list.reduce((a, k) => ((a[k.intent] = (a[k.intent] || 0) + 1), a), {});
  log(`    → ${list.length} keywords  (${Object.entries(byIntent).map(([i, n]) => `${n} ${i}`).join(', ')})`);
  return list;
}

// Cluster keywords by shared content tokens → candidate pillar/cluster topics.
export function clusterKeywords(keywords) {
  const STOP = new Set('the a an for to of and or with how what why best vs ai voice agent agents'.split(' '));
  const groups = new Map();
  for (const k of keywords) {
    const tokens = k.kw.split(/\s+/).filter((t) => t.length > 3 && !STOP.has(t));
    const anchor = tokens[0] || 'general';
    if (!groups.has(anchor)) groups.set(anchor, []);
    groups.get(anchor).push(k);
  }
  return [...groups.entries()]
    .map(([anchor, kws]) => ({ anchor, size: kws.length, intents: [...new Set(kws.map((k) => k.intent))], keywords: kws.map((k) => k.kw) }))
    .filter((g) => g.size >= 2)
    .sort((a, b) => b.size - a.size);
}
