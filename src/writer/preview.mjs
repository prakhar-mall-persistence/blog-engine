// The redesigned ARTICLE template — renders a finished Post as a clean,
// self-contained page in the Persistence design language (Manrope, purple
// #5925DC, white, radius 18/28), elevated over the current [slug].astro:
// hatch hero, "On this page" TOC, answer-first takeaways, sections with inline
// auto-graphics, FAQ accordion, related links, and FAQPage JSON-LD in <head>.
import { renderGraphic, heroGraphic, ACCENTS } from './graphics.mjs';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function renderPreview(post, faq) {
  const C = ACCENTS[post.imageColor] || ACCENTS.violet;
  const graphics = post.graphics || [];
  const usedGraphic = new Set();

  const graphicFor = (heading) => {
    const idx = graphics.findIndex((g, i) => !usedGraphic.has(i) && g.after && heading.toLowerCase().includes(String(g.after).toLowerCase().slice(0, 18)));
    if (idx === -1) return '';
    usedGraphic.add(idx);
    const svg = renderGraphic(graphics[idx], post.imageColor);
    return svg ? `<figure class="gfx">${svg}${graphics[idx].title ? `<figcaption>${esc(graphics[idx].title)}</figcaption>` : ''}</figure>` : '';
  };

  const toc = post.sections.map((s) => `<a href="#${s.id}">${esc(s.heading)}</a>`).join('');
  const takeaways = post.keyTakeaways?.length
    ? `<aside class="tldr"><div class="tldr-h">Key takeaways</div><ul>${post.keyTakeaways.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></aside>` : '';
  const sections = post.sections.map((s) =>
    `<section id="${s.id}"><h2>${esc(s.heading)}</h2>${s.content.split(/\n\n+/).map((p) => `<p>${esc(p)}</p>`).join('')}${graphicFor(s.heading)}</section>`).join('\n');
  // any graphics whose `after` didn't match a heading — append before FAQ
  const orphan = graphics.map((g, i) => usedGraphic.has(i) ? '' : (() => { const svg = renderGraphic(g, post.imageColor); return svg ? `<figure class="gfx">${svg}${g.title ? `<figcaption>${esc(g.title)}</figcaption>` : ''}</figure>` : ''; })()).join('');
  const faqBlock = faq ? `<section id="faq" class="faq"><h2>Frequently asked questions</h2>${faq.mainEntity.map((f) => `<details><summary>${esc(f.name)}<span class="chev"></span></summary><p>${esc(f.acceptedAnswer.text)}</p></details>`).join('')}</section>` : '';
  const related = post.relatedLinks?.length ? `<section class="related"><h2>More from the blog</h2><div class="rgrid">${post.relatedLinks.map((r) => `<a href="${esc(r.href)}"><span>${esc(r.label)}</span><span class="arr">→</span></a>`).join('')}</div></section>` : '';
  const schemaScript = faq ? `<script type="application/ld+json">${JSON.stringify(faq)}</script>` : '';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(post.seoTitle || post.title)}</title>
<meta name="description" content="${esc(post.description)}">
${schemaScript}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&display=swap">
<style>
  :root{
    --bg:#fff;--ink:#0a0a0a;--ink-soft:#565560;--ink-faint:#8a8a94;
    --line:rgba(0,0,0,.1);--line-soft:#f2f2f4;--purple:${C.a};--tint:${C.tint};--soft:${C.soft};
    --radius:18px;--radius-lg:28px;--font:'Manrope',-apple-system,BlinkMacSystemFont,sans-serif;
  }
  @media(prefers-color-scheme:dark){:root:not([data-theme=light]){
    --bg:#0b0b0d;--ink:#f4f3f7;--ink-soft:#a8a6b3;--ink-faint:#77747f;
    --line:rgba(255,255,255,.12);--line-soft:#17171b;--tint:#17131f;
  }}
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:var(--bg);color:var(--ink);font-family:var(--font);line-height:1.65;-webkit-font-smoothing:antialiased}
  a{color:inherit;text-decoration:none}
  .status{position:sticky;top:0;z-index:9;background:var(--purple);color:#fff;font-size:12.5px;font-weight:600;letter-spacing:.02em;padding:8px 20px;display:flex;gap:16px;flex-wrap:wrap;align-items:center}
  .status .dot{width:7px;height:7px;border-radius:50%;background:#fff;opacity:.7}
  .status code{font-family:ui-monospace,monospace;font-weight:500;background:rgba(255,255,255,.16);padding:2px 7px;border-radius:6px}

  .hero{position:relative;border-bottom:1px solid var(--line);overflow:hidden}
  .hatch{position:absolute;inset:0;background-image:repeating-linear-gradient(-45deg,rgba(0,0,0,.05) 0,rgba(0,0,0,.05) 1px,transparent 1px,transparent 10px);pointer-events:none}
  @media(prefers-color-scheme:dark){:root:not([data-theme=light]) .hatch{background-image:repeating-linear-gradient(-45deg,rgba(255,255,255,.045) 0,rgba(255,255,255,.045) 1px,transparent 1px,transparent 10px)}}
  .hero-in{position:relative;max-width:820px;margin:0 auto;padding:52px 24px 40px;text-align:center}
  .crumbs{display:inline-flex;gap:8px;align-items:center;margin-bottom:22px}
  .pill{font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;padding:5px 11px;border-radius:999px;background:var(--tint);color:var(--purple)}
  .pill.ghost{background:transparent;border:1px solid var(--line);color:var(--ink-faint)}
  h1{font-family:var(--font);font-weight:300;font-size:clamp(34px,5.4vw,58px);line-height:1.03;letter-spacing:-.03em;text-wrap:balance}
  h1 b{font-weight:700}
  .by{margin-top:18px;color:var(--ink-soft);font-size:14px}
  .heroimg{max-width:960px;margin:26px auto 0;border-radius:var(--radius-lg);overflow:hidden;border:1px solid var(--line)}

  .shell{max-width:1080px;margin:0 auto;padding:44px 24px 0;display:grid;grid-template-columns:220px 1fr;gap:48px;align-items:start}
  .toc{position:sticky;top:64px;font-size:13.5px}
  .toc .lab{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-faint);margin-bottom:14px}
  .toc a{display:block;color:var(--ink-soft);padding:6px 0 6px 14px;border-left:2px solid var(--line);transition:.15s}
  .toc a:hover{color:var(--purple);border-color:var(--purple)}
  article{min-width:0;max-width:720px}
  .tldr{background:var(--tint);border-radius:var(--radius);padding:22px 26px;margin:0 0 40px}
  .tldr-h{font-size:12px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--purple);margin-bottom:12px}
  .tldr ul{margin:0;padding-left:20px}.tldr li{margin:9px 0;font-size:15.5px;color:var(--ink)}
  article section{margin:0 0 40px}
  article h2{font-family:var(--font);font-weight:600;font-size:27px;letter-spacing:-.02em;margin:0 0 14px;text-wrap:balance;scroll-margin-top:64px}
  article p{margin:0 0 16px;font-size:18px;color:var(--ink);line-height:1.68}
  .gfx{margin:26px 0 6px}.gfx figcaption{font-size:12.5px;color:var(--ink-faint);text-align:center;margin-top:8px}

  .faq details{border:1px solid var(--line);border-radius:14px;padding:0;margin:10px 0;overflow:hidden;background:var(--bg)}
  .faq summary{list-style:none;cursor:pointer;font-weight:600;font-size:16px;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;gap:12px}
  .faq summary::-webkit-details-marker{display:none}
  .chev{width:9px;height:9px;border-right:2px solid var(--ink-faint);border-bottom:2px solid var(--ink-faint);transform:rotate(45deg);transition:.2s;flex:none}
  details[open] .chev{transform:rotate(-135deg)}
  .faq p{padding:0 20px 18px;font-size:16px;color:var(--ink-soft);margin:0}
  .related{border-top:1px solid var(--line);padding-top:30px;margin-top:8px}
  .rgrid{display:grid;gap:10px}
  .rgrid a{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:15px 18px;border:1px solid var(--line);border-radius:14px;font-weight:600;font-size:15px;transition:.15s}
  .rgrid a:hover{border-color:var(--purple);background:var(--tint)}.rgrid .arr{color:var(--purple)}
  footer{max-width:720px;margin:0 auto;color:var(--ink-faint);font-size:12px;padding:48px 24px 70px;font-family:ui-monospace,monospace}
  h2{scroll-margin-top:64px}
  @media(max-width:860px){.shell{grid-template-columns:1fr;gap:0}.toc{display:none}}
</style></head><body>
<div class="status"><span>✍️ ENGINE DRAFT · PREVIEW</span><span class="dot"></span><span>${esc(post.category)} · ${esc(post.readTime)}</span><span class="dot"></span><span>slug <code>${esc(post.slug)}</code></span><span class="dot"></span><span>${faq ? '✓ FAQ schema' : '—'}</span>${graphics.length ? `<span class="dot"></span><span>✓ ${graphics.length} graphic${graphics.length > 1 ? 's' : ''}</span>` : ''}</div>
<div class="hero"><div class="hatch"></div><div class="hero-in">
  <div class="crumbs"><span class="pill">${esc(post.category)}</span>${post.tag ? `<span class="pill ghost">${esc(post.tag)}</span>` : ''}</div>
  <h1><b>${esc(post.titleBold)}</b>${esc(post.titleRest)}</h1>
  <div class="by">${esc(post.author)} · ${esc(post.date)}</div>
</div>
<div class="heroimg">${heroGraphic(post.imageColor)}</div>
</div>
<div class="shell">
  <nav class="toc"><div class="lab">On this page</div>${toc}${faq ? `<a href="#faq">Frequently asked questions</a>` : ''}</nav>
  <article>
    ${takeaways}
    ${sections}
    ${orphan}
    ${faqBlock}
    ${related}
  </article>
</div>
<footer>Generated by the Persistence Blog Engine · grounded in persistence.dev · answer-first + FAQPage JSON-LD for AEO · graphics auto-generated in the site's design language</footer>
</body></html>`;
}
