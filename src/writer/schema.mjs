// The publish contract. Mirrors src/data/posts.ts in persistence-dev/website
// (astro-web branch) exactly, so what the writer emits drops straight in.

export const CATEGORIES = ['Product', 'Build with us', 'Company'];
export const IMAGE_COLORS = ['violet', 'indigo', 'navy', 'teal', 'emerald', 'amber', 'rose'];

export const slugify = (s) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Split "Before: after" into the hero's bold + rest, matching the site's cards.
function splitTitle(title) {
  const i = title.indexOf(':');
  if (i === -1) {
    const words = title.split(' ');
    const cut = Math.ceil(words.length / 2);
    return { titleBold: words.slice(0, cut).join(' '), titleRest: ' ' + words.slice(cut).join(' ') };
  }
  return { titleBold: title.slice(0, i + 1), titleRest: title.slice(i + 1) };
}

const today = () => new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

// Validate + normalise a raw draft into a Post object. Throws on hard errors,
// returns { post, warnings }.
export function assemblePost(draft) {
  const errs = [];
  const warn = [];
  const req = (f) => { if (!draft[f] || !String(draft[f]).trim()) errs.push(`missing ${f}`); };
  ['title', 'description', 'category'].forEach(req);
  if (!Array.isArray(draft.sections) || draft.sections.length < 2) errs.push('need ≥2 sections');
  if (draft.category && !CATEGORIES.includes(draft.category)) errs.push(`category must be one of ${CATEGORIES.join(', ')}`);
  const imageColor = draft.imageColor && IMAGE_COLORS.includes(draft.imageColor) ? draft.imageColor : (warn.push(`imageColor defaulted to violet`), 'violet');
  if (errs.length) throw new Error('Draft invalid:\n - ' + errs.join('\n - '));

  const title = draft.title.trim();
  const slug = draft.slug ? slugify(draft.slug) : slugify(title);
  const { titleBold, titleRest } = splitTitle(title);
  const seoTitle = draft.seoTitle || (`${title} | Persistence`.length > 60 ? undefined : `${title} | Persistence`);
  if (draft.description.length > 165) warn.push(`description is ${draft.description.length} chars (>165 may truncate in SERP)`);
  if (!draft.keyTakeaways?.length) warn.push('no keyTakeaways — AEO wants an answer-first block');

  const post = {
    slug,
    ...(seoTitle ? { seoTitle } : {}),
    title,
    titleBold,
    titleRest,
    description: draft.description.trim(),
    date: draft.date || today(),
    author: draft.author || 'Persistence Team',
    category: draft.category,
    readTime: draft.readTime || estimateReadTime(draft.sections),
    imageColor,
    tag: (draft.tag || 'GUIDE').toUpperCase(),
    dark: false,
    sections: draft.sections.map((s) => ({ id: slugify(s.heading), heading: s.heading, content: s.content.trim() })),
    ...(draft.keyTakeaways?.length ? { keyTakeaways: draft.keyTakeaways } : {}),
    ...(draft.relatedLinks?.length ? { relatedLinks: draft.relatedLinks } : {}),
    // Graphics are preview/render metadata (not part of the posts.ts text schema);
    // carried on the post so the article template can place them inline.
    ...(Array.isArray(draft.graphics) && draft.graphics.length ? { graphics: draft.graphics } : {}),
  };
  if (post.graphics) warn.push(`${post.graphics.length} inline graphic(s) attached`);
  return { post, warnings: warn };
}

function estimateReadTime(sections) {
  const words = sections.reduce((a, s) => a + s.content.split(/\s+/).length, 0);
  return `${Math.max(2, Math.round(words / 200))} min read`;
}

// FAQPage JSON-LD from the mined questions + short answers. This is the AEO win
// the readiness audit flagged as missing across the site.
export function faqJsonLd(faqs) {
  if (!faqs?.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

// Render the Post as a pasteable object for src/data/posts.ts (newest-first).
export function toPostsTsEntry(post) {
  const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const line = (k, v) => `    ${k}: ${v},`;
  const arr = (items) => items.length ? `[\n${items.map((i) => `      ${i},`).join('\n')}\n    ]` : '[]';
  const L = [];
  L.push('  {');
  L.push(line('slug', q(post.slug)));
  if (post.seoTitle) L.push(line('seoTitle', q(post.seoTitle)));
  L.push(line('title', q(post.title)));
  L.push(line('titleBold', q(post.titleBold)));
  L.push(line('titleRest', q(post.titleRest)));
  L.push(line('description', q(post.description)));
  L.push(line('date', q(post.date)));
  L.push(line('author', q(post.author)));
  L.push(line('category', q(post.category)));
  L.push(line('readTime', q(post.readTime)));
  L.push(line('imageColor', q(post.imageColor)));
  L.push(line('tag', q(post.tag)));
  L.push(line('dark', 'false'));
  if (post.keyTakeaways) L.push(line('keyTakeaways', arr(post.keyTakeaways.map(q))));
  L.push(`    sections: [`);
  for (const s of post.sections) {
    L.push('      {');
    L.push(`        id: ${q(s.id)},`);
    L.push(`        heading: ${q(s.heading)},`);
    L.push(`        content: ${q(s.content)},`);
    L.push('      },');
  }
  L.push('    ],');
  if (post.relatedLinks) {
    L.push(`    relatedLinks: [`);
    for (const r of post.relatedLinks) L.push(`      { label: ${q(r.label)}, href: ${q(r.href)} },`);
    L.push('    ],');
  }
  L.push('  },');
  return L.join('\n');
}
