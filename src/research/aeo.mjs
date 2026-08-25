// AEO / GEO layer — answer-engine optimization.
// Two questions: (1) for the questions people ask, who gets cited and is
// Persistence among them? (2) is Persistence's own content structured the way
// answer engines like to quote?
import { getText } from '../lib/fetch.mjs';
import { serp } from './serp.mjs';
import { askEngines, availableEngines } from '../lib/llm.mjs';

const OWN = 'persistence.dev';
const NON = /(^|\.)(duckduckgo|google|bing|yahoo|youtube|wikipedia|reddit|linkedin|facebook|twitter|medium|quora)\.(com|org|net|co)$/;

// Turn a topic + its keywords into natural question queries — what a person
// actually types/asks, which is what answer engines index against.
export function deriveQuestions(topic, keywords) {
  const kwTokens = new Set(topic.toLowerCase().split(/\s+/));
  // Only keep autocomplete questions that are actually on-topic (share a
  // distinctive token with the topic) — drops noise like "why are ai voices female".
  const distinctive = [...kwTokens].filter((t) => !['voice', 'ai', 'for', 'in', 'the'].includes(t));
  const fromKw = keywords
    .filter((k) => /^(how|what|why|can|does|is|which|when)\b/.test(k.kw))
    .filter((k) => distinctive.some((t) => k.kw.includes(t)))
    .map((k) => k.kw);
  const templated = [
    `what is ${topic}`,
    `how does ${topic} work`,
    `best ${topic} platform`,
    `benefits of ${topic}`,
  ];
  return [...new Set([...fromKw, ...templated])].slice(0, 6);
}

// Keyless proxy: the citation set an answer engine would most likely draw from
// is the top organic results. Probe each question, roll up who "owns the answer".
export async function citationProbe(questions, { log = () => {} } = {}) {
  const perQ = [];
  const cited = new Map();
  let sampled = 0;
  for (const q of questions) {
    const raw = await serp(q, { log });
    if (raw.blocked) { perQ.push({ question: q, blocked: true, citationSet: [], persistenceRank: null }); continue; }
    sampled++;
    const r = raw.filter((x) => !NON.test(x.domain)).slice(0, 5);
    const persistenceRank = r.find((x) => x.domain.includes(OWN))?.rank || null;
    perQ.push({ question: q, citationSet: r.map((x) => ({ domain: x.domain, rank: x.rank })), persistenceRank });
    r.forEach((x) => {
      const d = cited.get(x.domain) || { domain: x.domain, timesCited: 0, bestRank: 99 };
      d.timesCited++; d.bestRank = Math.min(d.bestRank, x.rank);
      cited.set(x.domain, d);
    });
  }
  const ownedByPersistence = perQ.filter((q) => q.persistenceRank).length;
  return {
    method: 'serp-proxy',
    sampled, total: questions.length,
    questions: perQ,
    topCited: [...cited.values()].filter((d) => !d.domain.includes(OWN)).sort((a, b) => b.timesCited - a.timesCited).slice(0, 8),
    persistenceOwns: `${ownedByPersistence}/${sampled} sampled`,
  };
}

// With a key: actually ask the engines and read back real citations.
export async function liveCitationProbe(questions, { log = () => {} } = {}) {
  const engines = availableEngines();
  if (!engines.length) return null;
  log(`🤖  Live answer-engine probe via: ${engines.join(', ')}`);
  const results = [];
  for (const q of questions) {
    const answers = await askEngines(q);
    results.push({ question: q, answers: answers.map((a) => ({ engine: a.engine, citesPersistence: a.citesPersistence, citedDomains: a.citedDomains, error: a.error })) });
  }
  return { method: 'live-llm', engines, results };
}

// AEO-readiness audit: does Persistence's best-matching page have the structure
// answer engines reward? Reads the live page HTML (cached) and checks for:
//  - JSON-LD FAQPage / HowType schema
//  - an answer-first / key-takeaways block
//  - question-shaped H2s
export async function readinessAudit(groundingUrl, { log = () => {} } = {}) {
  if (!groundingUrl) return null;
  let html = '';
  try { html = await getText(groundingUrl, { ttlHours: 168 }); } catch { return null; }
  const ld = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const schemaTypes = new Set();
  for (const block of ld) { try { JSON.parse(block); } catch {} for (const t of ['FAQPage', 'HowTo', 'Article', 'BreadcrumbList', 'Organization']) if (block.includes(`"${t}"`)) schemaTypes.add(t); }
  const checks = {
    hasFaqSchema: schemaTypes.has('FAQPage'),
    hasHowToSchema: schemaTypes.has('HowTo'),
    hasArticleSchema: schemaTypes.has('Article'),
    hasKeyTakeaways: /key\s*takeaway|tl;?dr|in short|quick answer/i.test(html),
    hasQuestionHeadings: (html.match(/<h2[^>]*>[^<]*\?/gi) || []).length,
    schemaTypes: [...schemaTypes],
  };
  const score = [checks.hasFaqSchema, checks.hasHowToSchema, checks.hasKeyTakeaways, checks.hasQuestionHeadings > 0].filter(Boolean).length;
  log(`📋  AEO-readiness of ${groundingUrl.split('/').filter(Boolean).pop()}: ${score}/4`);
  return { url: groundingUrl, score, max: 4, checks };
}

export async function aeoAnalysis(topic, keywords, grounding, { log = () => {} } = {}) {
  log('🎯  AEO/GEO analysis');
  const questions = deriveQuestions(topic, keywords);
  log(`    questions: ${questions.join(' · ')}`);
  const proxy = await citationProbe(questions, { log });
  const live = await liveCitationProbe(questions, { log });
  const readiness = await readinessAudit(grounding[0]?.url, { log });
  log(`    Persistence owns the answer for ${proxy.persistenceOwns} questions · top answer-owner: ${proxy.topCited[0]?.domain || 'n/a'}`);
  return { questions, proxy, live, readiness };
}
