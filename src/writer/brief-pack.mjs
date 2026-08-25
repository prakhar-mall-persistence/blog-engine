// Assemble the writer-brief pack: everything needed to draft one post, pulled
// from the brain + a research brief. This is the hand-off from research → writing.
import { retrieve, allPosts } from '../brain/retrieve.mjs';
import { tokenize } from '../brain/ingest.mjs';
import { classifyIntent } from '../research/keywords.mjs';

const STOP = new Set('voice ai the for and with how what why best vs a an to in of'.split(' '));

// Suggest internal links from existing posts that share vocabulary with the topic.
async function relatedInternal(topic, limit = 5) {
  const posts = await allPosts();
  const t = new Set(tokenize(topic));
  return posts
    .map((p) => {
      const ps = new Set(tokenize(p.slug.replace(/-/g, ' ')));
      let shared = 0; for (const w of t) if (ps.has(w)) shared++;
      return { slug: p.slug, title: p.title, href: `/resources/blog/${p.slug}/`, shared };
    })
    .filter((p) => p.shared > 0)
    .sort((a, b) => b.shared - a.shared)
    .slice(0, limit)
    .map((p) => ({ label: p.title, href: p.href }));
}

export async function buildPack(target, { brief = null, log = () => {} } = {}) {
  log(`📦  Building writer pack for "${target}"`);
  // Grounding: the actual Persistence text most relevant to the target.
  const grounding = (await retrieve(target, 8))
    .filter((g, i, arr) => arr.findIndex((x) => x.url === g.url) === i)
    .filter((g) => !g.url.endsWith('/resources/blog/'))
    .slice(0, 5)
    .map((g) => ({ title: g.title, url: g.url, excerpt: g.text.slice(0, 600) }));

  const questions = brief?.aeo?.questions || [];
  const competitorSnippets = (brief?.aeo?.proxy?.questions || [])
    .flatMap((q) => (q.citationSet || []).slice(0, 3).map((c) => c.domain))
    .filter((d, i, a) => a.indexOf(d) === i).slice(0, 8);
  const answerOwner = brief?.aeo?.proxy?.topCited?.[0]?.domain || null;
  const relatedLinks = await relatedInternal(target);

  const pack = {
    target,
    intent: classifyIntent(target),
    generatedAt: new Date().toISOString(),
    questions,                 // → FAQ + H2s (AEO)
    answerOwner,               // the domain to out-answer
    competitors: competitorSnippets,
    grounding,                 // factual, on-brand source material
    relatedLinks,              // internal-link graph
    guidance: {
      structure: ['Answer-first summary (keyTakeaways)', 'What it is', 'How it works for this use case', 'What to look for / pitfalls', 'How Persistence does it', 'FAQ'],
      seo: `Primary keyword "${target}" in title, first 100 words, one H2, description, and slug.`,
      aeo: 'Lead each section with the direct answer, then elaborate. Use the mined questions verbatim as H2s and FAQ entries. Emit FAQPage JSON-LD.',
      tone: 'Plain, concrete, engineering-honest. No hype. Match the existing Persistence blog voice: short sentences, specific, a little dry.',
    },
  };
  log(`    grounding: ${grounding.length} sources · questions: ${questions.length} · internal links: ${relatedLinks.length}${answerOwner ? ` · out-answer: ${answerOwner}` : ''}`);
  return pack;
}
