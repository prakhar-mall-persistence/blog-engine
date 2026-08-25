// ORCHESTRATOR — topic in, a transparent research brief out. Every step logs
// what it's doing and why, then the whole run is written to output/ as Markdown.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { retrieve, brainStats } from './brain/retrieve.mjs';
import { expandKeywords, clusterKeywords } from './research/keywords.mjs';
import { competitorProfile } from './research/serp.mjs';
import { gapAnalysis } from './research/gap.mjs';
import { aeoAnalysis } from './research/aeo.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../output');

export async function research(topic, { log = console.log } = {}) {
  const t0 = Date.now();
  log(`\n━━━ RESEARCH: "${topic}" ━━━\n`);

  // 1. UNDERSTAND — what does Persistence already say about this?
  const stats = await brainStats();
  log(`🧠  Brain: ${stats.pages} pages / ${stats.posts} posts / ${stats.chunks} chunks`);
  // Retrieve extra, then dedupe by URL and drop listing/index pages so grounding
  // is real articles, not the blog index repeated.
  const raw = await retrieve(topic, 20);
  const byUrl = new Map();
  for (const g of raw) {
    if (g.url.endsWith('/resources/blog/') || g.url === 'https://persistence.dev/') continue;
    if (!byUrl.has(g.url)) byUrl.set(g.url, g);
  }
  const grounding = [...byUrl.values()].slice(0, 6);
  log(`    top grounding: ${grounding.slice(0, 3).map((g) => g.title).join(' · ') || '(none)'}`);

  // 2. KEYWORDS + intent + clusters
  const keywords = await expandKeywords(topic, { log });
  const clusters = clusterKeywords(keywords);
  log(`🗂  ${clusters.length} candidate clusters (top: ${clusters.slice(0, 3).map((c) => `${c.anchor}×${c.size}`).join(', ')})`);

  // 3. COMPETITORS / SERP — sample the highest-intent keywords
  const probe = [topic, ...keywords.filter((k) => k.intent !== 'informational').slice(0, 3).map((k) => k.kw)];
  const comp = await competitorProfile([...new Set(probe)], 'persistence.dev', { log });
  log(`🏁  Top competitors: ${comp.competitors.slice(0, 5).map((c) => c.domain).join(', ')}`);
  log(comp.ownPresence ? `    Persistence appears in ${comp.ownPresence.appearances} result(s), best rank #${comp.ownPresence.bestRank}` : '    Persistence not in sampled top results');

  // 4. GAP analysis vs existing content
  const gap = await gapAnalysis(keywords, { log });

  // 5. AEO / GEO — answer-engine citation set + Persistence's readiness
  const aeo = await aeoAnalysis(topic, keywords, grounding, { log });

  const brief = {
    topic, generatedAt: new Date().toISOString(), durationMs: Date.now() - t0,
    grounding: grounding.map((g) => ({ title: g.title, url: g.url, score: +g.score.toFixed(1) })),
    keywords, clusters, competitors: comp, gap, aeo,
  };
  const md = renderBrief(brief);
  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  await writeFile(join(OUT, `brief-${slug}.json`), JSON.stringify(brief, null, 2));
  await writeFile(join(OUT, `brief-${slug}.md`), md);
  log(`\n✅  Done in ${((Date.now() - t0) / 1000).toFixed(1)}s → output/brief-${slug}.md\n`);
  return { brief, md, slug };
}

function renderBrief(b) {
  const intents = b.keywords.reduce((a, k) => ((a[k.intent] = (a[k.intent] || 0) + 1), a), {});
  const kwRow = (k) => `| ${k.kw} | ${k.intent} |`;
  return `# Research brief — ${b.topic}

_Generated ${b.generatedAt} · ${(b.durationMs / 1000).toFixed(1)}s · keyless free-tier sources_

## 1. What Persistence already says (brain grounding)
${b.grounding.length ? b.grounding.map((g) => `- **${g.title}** — ${g.url} _(relevance ${g.score})_`).join('\n') : '_No strongly matching existing content — greenfield topic._'}

## 2. Keywords (${b.keywords.length}) — ${Object.entries(intents).map(([i, n]) => `${n} ${i}`).join(', ')}
| keyword | intent |
|---|---|
${b.keywords.slice(0, 40).map(kwRow).join('\n')}

## 3. Topic clusters (pillar candidates)
${b.clusters.slice(0, 8).map((c) => `- **${c.anchor}** (${c.size}) — ${c.keywords.slice(0, 6).join(', ')}`).join('\n')}

## 4. Competitors / SERP
${b.competitors.ownPresence ? `**Persistence presence:** ${b.competitors.ownPresence.appearances} appearance(s), best rank #${b.competitors.ownPresence.bestRank} across ${b.competitors.ownPresence.ofQueries} queries.` : '**Persistence not found** in the sampled top results — pure opportunity.'}

| # | competitor | appearances | best rank |
|---|---|---|---|
${b.competitors.competitors.map((c, i) => `| ${i + 1} | ${c.domain} | ${c.appearances} | #${c.bestRank} |`).join('\n')}

## 5. Content gaps vs ${b.gap.totalExisting} existing posts
**${b.gap.gaps.length} gaps** (write these) · **${b.gap.covered.length} already covered** (cannibalization risk — update, don't duplicate)

### Recommended net-new posts (highest-intent gaps first)
${b.gap.gaps.slice(0, 15).map((g) => `- \`${g.intent}\` **${g.kw}** ${g.closest ? `_(closest existing: ${g.closest}, ${g.match})_` : ''}`).join('\n')}

${b.gap.covered.length ? `### Already covered — update instead of writing new\n${b.gap.covered.slice(0, 10).map((c) => `- ${c.kw} → \`${c.existing}\` (${c.match})`).join('\n')}` : ''}

## 6. AEO / GEO — winning the answer engines
_Method: ${b.aeo.proxy.method}${b.aeo.live ? ` + live (${b.aeo.live.engines.join(', ')})` : ' (add PERPLEXITY_API_KEY for live citations)'}_

**Persistence owns the answer for ${b.aeo.proxy.persistenceOwns} target questions.** ${b.aeo.proxy.sampled < b.aeo.proxy.total ? `_(${b.aeo.proxy.total - b.aeo.proxy.sampled} question(s) rate-limited by the keyless SERP — a Serper.dev or Perplexity key samples all of them.)_` : ''}

### Questions answer engines index for this topic
${b.aeo.questions.map((q) => `- ${q}`).join('\n')}

### Who owns the answer today (likely citation set)
| domain | times in citation set | best rank |
|---|---|---|
${b.aeo.proxy.topCited.map((c) => `| ${c.domain} | ${c.timesCited} | #${c.bestRank} |`).join('\n')}
${b.aeo.live ? `\n### Live answer-engine check\n${b.aeo.live.results.map((r) => `- **${r.question}** — ${r.answers.map((a) => `${a.engine}: ${a.citesPersistence ? '✅ cites Persistence' : '❌ no Persistence'}`).join(', ')}`).join('\n')}` : ''}

### AEO-readiness of Persistence's closest page
${b.aeo.readiness ? `\`${b.aeo.readiness.url.split('/').filter(Boolean).pop()}\` scores **${b.aeo.readiness.score}/${b.aeo.readiness.max}**
- FAQ schema: ${b.aeo.readiness.checks.hasFaqSchema ? '✅' : '❌ add FAQPage JSON-LD'}
- HowTo schema: ${b.aeo.readiness.checks.hasHowToSchema ? '✅' : '➖ (only if it\'s a how-to)'}
- Answer-first / key-takeaways block: ${b.aeo.readiness.checks.hasKeyTakeaways ? '✅' : '❌ add a quotable summary up top'}
- Question-shaped H2s: ${b.aeo.readiness.checks.hasQuestionHeadings > 0 ? `✅ ${b.aeo.readiness.checks.hasQuestionHeadings}` : '❌ phrase headings as the questions people ask'}
- Schema present: ${b.aeo.readiness.checks.schemaTypes.join(', ') || 'none'}` : '_No matching Persistence page — greenfield, build it answer-first from the start._'}

**AEO action for the new post:** lead with a 2–3 sentence quotable answer, add FAQPage JSON-LD for the mined questions, and use the questions above verbatim as H2s.

---
### Next: hand this brief to the writer stage (Phase 2)
The writer will pick a gap, pull grounding from the brain, and emit a valid \`Post\` object for \`src/data/posts.ts\`.
_AEO/GEO citation analysis and paid keyword volumes plug in here without changing anything downstream._
`;
}
