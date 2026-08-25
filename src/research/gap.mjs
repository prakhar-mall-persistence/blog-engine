// Content-gap + cannibalization analysis against what Persistence already
// publishes. Uses the brain's existing posts as the baseline.
import { allPosts } from '../brain/retrieve.mjs';
import { tokenize } from '../brain/ingest.mjs';

const sig = (s) => new Set(tokenize(s));
// Jaccard similarity — symmetric, doesn't spike to 1.0 just because a short
// keyword's few tokens all appear in a longer title.
const overlap = (a, b) => {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
};

export async function gapAnalysis(keywords, { log = () => {} } = {}) {
  const posts = await allPosts();
  const postSigs = posts.map((p) => ({ ...p, sig: sig(p.slug.replace(/-/g, ' ') + ' ' + (p.title || '')) }));

  const gaps = [];      // keywords with no strong existing coverage
  const covered = [];   // keywords already well covered (cannibalization risk)
  for (const k of keywords) {
    const ks = sig(k.kw);
    let best = { score: 0, post: null };
    for (const p of postSigs) {
      const s = overlap(ks, p.sig);
      if (s > best.score) best = { score: s, post: p };
    }
    if (best.score >= 0.5) covered.push({ kw: k.kw, intent: k.intent, existing: best.post.slug, match: +best.score.toFixed(2) });
    // Only name a "closest existing" when it's a meaningful match; otherwise it's a clean gap.
    else gaps.push({ kw: k.kw, intent: k.intent, closest: best.score >= 0.25 ? best.post?.slug : null, match: +best.score.toFixed(2) });
  }
  log(`🕳  Gap analysis vs ${posts.length} existing posts: ${gaps.length} gaps, ${covered.length} already covered`);
  // Prioritise gaps: commercial/transactional intent first, then informational.
  const rank = { commercial: 0, transactional: 1, informational: 2 };
  gaps.sort((a, b) => rank[a.intent] - rank[b.intent] || a.match - b.match);
  return { totalExisting: posts.length, gaps, covered };
}
