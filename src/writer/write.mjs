// THE WRITER. Turns a brief-pack into a validated Post + FAQ JSON-LD + preview.
//
// LLM-pluggable: with ANTHROPIC_API_KEY it calls Claude to produce the draft
// JSON; without a key it writes the pack + the exact prompt to output/ so the
// draft can be produced in-session (Claude Code) or by hand, then assembled.
import { writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { assemblePost, faqJsonLd, toPostsTsEntry, slugify } from './schema.mjs';
import { renderPreview } from './preview.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../output');

// The system prompt that defines a good Persistence post. Used by the LLM path
// and documented for the in-session path.
export function buildPrompt(pack) {
  return {
    system: `You are the Persistence blog writer. You write clean, plain-language, engineering-honest posts about voice AI. No hype, no filler, short concrete sentences. You never invent product facts — you only claim what the GROUNDING supports; for anything else you speak generally about the domain.

Output STRICT JSON matching this shape (no markdown, no prose outside JSON):
{
  "title": "Before: after"  (a colon-split headline; primary keyword in the first half),
  "seoTitle": "≤60 chars incl. ' | Persistence'",
  "description": "1-2 sentences, ≤160 chars, primary keyword, used for SEO + card",
  "category": one of ["Product","Build with us","Company"],
  "tag": "SHORT UPPERCASE e.g. GUIDE / DEEP DIVE / USE CASE",
  "imageColor": one of ["violet","indigo","navy","teal","emerald","amber","rose"],
  "keyTakeaways": ["3-5 answer-first bullets a reader (or an answer engine) can quote without scrolling"],
  "sections": [{"heading":"...", "content":"2-4 paragraphs of plain text"}]  (follow the structure guidance; use the mined questions verbatim as some H2s),
  "faqs": [{"q":"mined question","a":"2-3 sentence direct answer"}]  (becomes FAQPage JSON-LD),
  "graphics": [   // 1-2 inline diagrams that genuinely aid comprehension — omit if none would
    {"type":"flow",  "after":"<exact heading text to place this under>", "title":"short label", "steps":[{"label":"3-4 words","sub":"one short line"}]},   // a process, 3-5 steps
    {"type":"fit",   "after":"<heading>", "title":"Where it fits", "fits":["short phrase"], "avoids":["short phrase"]},   // good-fit vs not
    {"type":"stats", "after":"<heading>", "title":"short label", "stats":[{"value":"24/7","label":"short"}]}   // 2-4 headline numbers; only if the numbers are real/defensible
  ]
}
Only include a graphic when it clarifies something a paragraph can't. Never invent statistics for a 'stats' graphic.`,
    user: JSON.stringify(pack, null, 2),
  };
}

async function draftViaAnthropic(pack) {
  const { system, user } = buildPrompt(pack);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-opus-4-8', max_tokens: 8000, system, messages: [{ role: 'user', content: user }] }),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new Error(`anthropic HTTP ${res.status}`);
  const data = await res.json();
  const text = data.content?.map((c) => c.text).join('') || '';
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(json);
}

// Assemble a finished, validated post from a raw draft (from the LLM or in-session).
export async function finalize(draft, { log = console.log } = {}) {
  const relatedLinks = draft.relatedLinks || draft._relatedLinks;
  const { post, warnings } = assemblePost({ ...draft, relatedLinks });
  const faq = faqJsonLd(draft.faqs);
  warnings.forEach((w) => log(`    ⚠ ${w}`));

  const tsEntry = toPostsTsEntry(post);
  const previewHtml = renderPreview(post, faq);
  const base = join(OUT, `post-${post.slug}`);
  await writeFile(`${base}.json`, JSON.stringify({ post, faq }, null, 2));
  await writeFile(`${base}.posts-entry.ts`, tsEntry + '\n');
  if (faq) await writeFile(`${base}.faq.jsonld`, JSON.stringify(faq, null, 2));
  await writeFile(`${base}.preview.html`, previewHtml);
  log(`✅  Post "${post.title}" → output/post-${post.slug}.{json,posts-entry.ts,faq.jsonld,preview.html}`);
  return { post, faq, tsEntry, previewPath: `${base}.preview.html` };
}

// Full path: pack → draft (LLM if keyed, else pause for in-session draft) → finalize.
export async function write(pack, { log = console.log } = {}) {
  if (process.env.ANTHROPIC_API_KEY) {
    log('✍️  Drafting via Claude (Anthropic API)…');
    const draft = await draftViaAnthropic(pack);
    draft._relatedLinks = pack.relatedLinks;
    // SEO: the slug is the exact target keyword, not the (longer) headline.
    draft.slug = slugify(pack.target);
    return finalize(draft, { log });
  }
  // Keyless: emit the pack + prompt for an in-session draft.
  const { system, user } = buildPrompt(pack);
  const slug = slugify(pack.target);
  await writeFile(join(OUT, `pack-${slug}.json`), JSON.stringify(pack, null, 2));
  await writeFile(join(OUT, `prompt-${slug}.md`), `# Writer prompt for "${pack.target}"\n\n## System\n\n${system}\n\n## User (the pack)\n\n\`\`\`json\n${user}\n\`\`\`\n`);
  log(`ℹ️  No ANTHROPIC_API_KEY. Wrote pack + prompt to output/. Provide a draft JSON, then run finalize.`);
  return { pack, needsDraft: true };
}

// Assemble from a draft JSON file on disk (the in-session path uses this).
export async function finalizeFromFile(path, relatedLinks, opts) {
  if (!existsSync(path)) throw new Error(`draft not found: ${path}`);
  const draft = JSON.parse(await readFile(path, 'utf8'));
  if (relatedLinks && !draft.relatedLinks) draft.relatedLinks = relatedLinks;
  return finalize(draft, opts);
}
