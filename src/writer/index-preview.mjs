// The redesigned BLOG INDEX — parses the real src/data/posts.ts + any
// engine-generated posts and renders an elevated index in the Persistence
// design language: hatch "Blog" hero, live search, category tabs, a featured
// lead card, and a responsive grid of cards with on-brand illustrations.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ACCENTS } from './graphics.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA = join(ROOT, '../../data/posts.source.ts');
const OUTDIR = join(ROOT, '../../output');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const un = (s) => String(s).replace(/\\'/g, "'").replace(/\\\\/g, '\\');

// Parse card metadata out of the posts.ts source (regex per post window).
function parsePosts(src) {
  const idxs = [...src.matchAll(/\n\s*slug:\s*'/g)].map((m) => m.index);
  const grab = (block, field) => { const m = block.match(new RegExp(field + ":\\s*'((?:[^'\\\\]|\\\\.)*)'")); return m ? un(m[1]) : ''; };
  const posts = [];
  for (let i = 0; i < idxs.length; i++) {
    const block = src.slice(idxs[i], idxs[i + 1] ?? src.length);
    const slug = grab(block, 'slug');
    if (!slug) continue;
    posts.push({
      slug,
      title: grab(block, 'title') || slug,
      titleBold: grab(block, 'titleBold'),
      titleRest: grab(block, 'titleRest'),
      description: grab(block, 'description'),
      date: grab(block, 'date'),
      author: grab(block, 'author') || 'Persistence Team',
      category: grab(block, 'category') || 'Company',
      readTime: grab(block, 'readTime'),
      imageColor: grab(block, 'imageColor') || 'violet',
      tag: grab(block, 'tag'),
    });
  }
  return posts;
}

// Compact on-brand card illustration: gradient + dot field + waveform.
function illo(color, seed = 0) {
  const C = ACCENTS[color] || ACCENTS.violet;
  let bars = '';
  for (let i = 0; i < 22; i++) {
    const h = 10 + Math.abs(Math.sin((i + seed) * 0.7) * 46) + (i % 3) * 5;
    bars += `<rect x="${18 + i * 15}" y="${100 - h / 2}" width="6" height="${h}" rx="3" fill="${C.a}" opacity="${0.22 + (i % 5) * 0.12}"/>`;
  }
  return `<svg viewBox="0 0 360 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g${color}${seed}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.tint}"/><stop offset="1" stop-color="${C.tint}" stop-opacity=".3"/></linearGradient>
    <pattern id="d${color}${seed}" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="${C.a}" fill-opacity=".18"/></pattern></defs>
    <rect width="360" height="200" fill="url(#g${color}${seed})"/><rect width="360" height="200" fill="url(#d${color}${seed})"/>
    <g transform="translate(0,50)">${bars}</g></svg>`;
}

function card(p, i, featured = false) {
  const cls = featured ? 'card feat' : 'card';
  const badge = p._engine ? `<span class="engine">✨ Engine draft</span>` : '';
  const title = p.titleBold ? `<b>${esc(p.titleBold)}</b>${esc(p.titleRest)}` : esc(p.title);
  return `<a class="${cls}" href="/resources/blog/${esc(p.slug)}/" data-cat="${esc(p.category)}" data-search="${esc((p.title + ' ' + p.description).toLowerCase())}">
    <div class="illo">${illo(p.imageColor, i)}<span class="tag">${esc(p.tag || p.category)}</span>${badge}</div>
    <div class="body">
      <div class="meta">${esc(p.date)}</div>
      <h3>${title}</h3>
      <p>${esc(p.description)}</p>
      <div class="foot"><span>${esc(p.author)}</span><span class="sep">·</span><span>${esc(p.readTime)}</span><span class="sep">·</span><span class="cat">${esc(p.category)}</span></div>
    </div>
  </a>`;
}

export async function buildIndex() {
  const src = await readFile(DATA, 'utf8');
  let posts = parsePosts(src);
  // Fold in engine-generated posts (from output/post-*.json), tagged.
  for (const f of (await readdir(OUTDIR)).filter((f) => f.startsWith('post-') && f.endsWith('.json'))) {
    try { const { post } = JSON.parse(await readFile(join(OUTDIR, f), 'utf8')); if (post && !posts.find((p) => p.slug === post.slug)) posts.unshift({ ...post, _engine: true }); } catch {}
  }
  const cats = ['View all', 'Product', 'Build with us', 'Company'];
  const [lead, ...rest] = posts;
  const html = render(lead, rest, cats, posts.length);
  const out = join(OUTDIR, 'blog-index.preview.html');
  await writeFile(out, html);
  return { out, count: posts.length };
}

function render(lead, rest, cats, total) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Blog | Persistence</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&display=swap">
<style>
  :root{--bg:#fff;--ink:#0a0a0a;--ink-soft:#565560;--ink-faint:#8a8a94;--line:rgba(0,0,0,.1);--line-soft:#f2f2f4;--purple:#5925DC;--tint:#ede8fb;--radius:18px;--radius-lg:28px;--font:'Manrope',-apple-system,sans-serif}
  @media(prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0b0b0d;--ink:#f4f3f7;--ink-soft:#a8a6b3;--ink-faint:#77747f;--line:rgba(255,255,255,.12);--line-soft:#151519;--tint:#1a1330}}
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:var(--bg);color:var(--ink);font-family:var(--font);-webkit-font-smoothing:antialiased}
  a{color:inherit;text-decoration:none}
  .topbar{border-bottom:1px solid var(--line);padding:16px 32px;display:flex;align-items:center;gap:10px;position:sticky;top:0;background:color-mix(in srgb,var(--bg) 86%,transparent);backdrop-filter:blur(10px);z-index:20}
  .logo{width:24px;height:24px;border-radius:7px;background:linear-gradient(135deg,#7c3aed,#5925DC)}
  .brand{font-weight:800;letter-spacing:-.02em}
  .topbar nav{margin-left:auto;display:flex;gap:26px;font-size:14px;font-weight:600;color:var(--ink-soft)}
  .topbar .cta{background:var(--ink);color:var(--bg);padding:8px 16px;border-radius:999px;font-size:13px}
  @media(max-width:760px){.topbar nav{display:none}}

  .hero{position:relative;overflow:hidden;border-bottom:1px solid var(--line)}
  .hatch{position:absolute;inset:0;background-image:repeating-linear-gradient(-45deg,rgba(0,0,0,.05) 0,rgba(0,0,0,.05) 1px,transparent 1px,transparent 10px)}
  @media(prefers-color-scheme:dark){:root:not([data-theme=light]) .hatch{background-image:repeating-linear-gradient(-45deg,rgba(255,255,255,.045) 0,rgba(255,255,255,.045) 1px,transparent 1px,transparent 10px)}}
  .hero-in{position:relative;text-align:center;padding:72px 24px 56px}
  .hero h1{font-weight:300;font-size:clamp(72px,11vw,132px);line-height:.95;letter-spacing:-.04em}
  .hero .sub{margin-top:14px;color:var(--ink-soft);font-size:16px}

  .wrap{max-width:1200px;margin:0 auto;padding:0 24px}
  .controls{display:flex;gap:16px;align-items:center;flex-wrap:wrap;padding:26px 0;border-bottom:1px solid var(--line);position:sticky;top:57px;background:color-mix(in srgb,var(--bg) 90%,transparent);backdrop-filter:blur(8px);z-index:10}
  .search{flex:1;min-width:200px;display:flex;align-items:center;gap:10px;border:1px solid var(--line);border-radius:999px;padding:11px 18px}
  .search input{border:none;background:none;outline:none;font-family:var(--font);font-size:15px;color:var(--ink);width:100%}
  .search svg{flex:none;stroke:var(--ink-faint)}
  .tabs{display:flex;gap:8px;flex-wrap:wrap}
  .tab{font-size:13px;font-weight:600;padding:9px 16px;border-radius:999px;border:1px solid var(--line);color:var(--ink-soft);cursor:pointer;transition:.15s;background:none;font-family:var(--font)}
  .tab.on{background:var(--ink);color:var(--bg);border-color:var(--ink)}
  .count{font-size:13px;color:var(--ink-faint);margin-left:auto}

  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;padding:34px 0 80px}
  @media(max-width:980px){.grid{grid-template-columns:repeat(2,1fr)}}
  @media(max-width:640px){.grid{grid-template-columns:1fr}}
  .card{border:1px solid var(--line);border-radius:var(--radius-lg);overflow:hidden;background:var(--bg);display:flex;flex-direction:column;transition:.18s}
  .card:hover{transform:translateY(-3px);border-color:var(--purple);box-shadow:0 12px 30px -12px rgba(89,37,220,.25)}
  .card .illo{position:relative;aspect-ratio:16/9;overflow:hidden;border-bottom:1px solid var(--line)}
  .card .illo svg{width:100%;height:100%;display:block}
  .illo .tag{position:absolute;top:12px;right:12px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(6px);color:var(--ink);padding:5px 9px;border-radius:999px}
  .illo .engine{position:absolute;top:12px;left:12px;font-size:10px;font-weight:700;background:var(--purple);color:#fff;padding:5px 9px;border-radius:999px}
  .card .body{padding:20px 22px 22px;display:flex;flex-direction:column;gap:10px;flex:1}
  .card .meta{font-size:12.5px;color:var(--ink-faint)}
  .card h3{font-weight:300;font-size:21px;line-height:1.2;letter-spacing:-.02em}.card h3 b{font-weight:700}
  .card p{font-size:14px;color:var(--ink-soft);line-height:1.55;flex:1}
  .card .foot{font-size:12.5px;color:var(--ink-faint);display:flex;gap:7px;align-items:center;flex-wrap:wrap}
  .card .foot .cat{color:var(--purple);font-weight:600}.foot .sep{opacity:.5}

  /* featured lead card spans full width */
  .feat{grid-column:1/-1;flex-direction:row}
  .feat .illo{aspect-ratio:auto;width:46%;border-bottom:none;border-right:1px solid var(--line)}
  .feat .body{justify-content:center;padding:40px}
  .feat h3{font-size:34px;line-height:1.08}
  .feat p{flex:none;font-size:16px;max-width:46ch}
  @media(max-width:760px){.feat{flex-direction:column}.feat .illo{width:100%;aspect-ratio:16/9;border-right:none;border-bottom:1px solid var(--line)}.feat .body{padding:22px}.feat h3{font-size:24px}}
  .empty{grid-column:1/-1;text-align:center;color:var(--ink-faint);padding:60px 0;display:none}
</style></head><body>
<div class="topbar"><div class="logo"></div><span class="brand">Persistence</span>
  <nav><span>Solutions</span><span>Feature</span><span>Resource</span><span>Pricing</span></nav>
  <span class="cta">Start for free</span>
</div>
<header class="hero"><div class="hatch"></div><div class="hero-in"><h1>Blog</h1><div class="sub">Building the Future of AI Conversations</div></div></header>
<div class="wrap">
  <div class="controls">
    <label class="search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg><input id="q" placeholder="Search ${total} posts…" oninput="filter()"></label>
    <div class="tabs">${cats.map((c, i) => `<button class="tab${i === 0 ? ' on' : ''}" data-cat="${esc(c)}" onclick="pick(this)">${esc(c)}</button>`).join('')}</div>
    <span class="count" id="count"></span>
  </div>
  <div class="grid" id="grid">
    ${card(lead, 0, true)}
    ${rest.map((p, i) => card(p, i + 1)).join('\n')}
    <div class="empty" id="empty">No posts match — try another search or category.</div>
  </div>
</div>
<script>
  let cat='View all';
  function pick(btn){document.querySelectorAll('.tab').forEach(t=>t.classList.remove('on'));btn.classList.add('on');cat=btn.dataset.cat;filter()}
  function filter(){
    const q=document.getElementById('q').value.trim().toLowerCase();
    let n=0;
    document.querySelectorAll('.card').forEach(c=>{
      const okCat=cat==='View all'||c.dataset.cat===cat;
      const okQ=!q||c.dataset.search.includes(q);
      const show=okCat&&okQ;c.style.display=show?'':'none';if(show)n++;
    });
    document.getElementById('count').textContent=n+' post'+(n===1?'':'s');
    document.getElementById('empty').style.display=n?'none':'block';
  }
  filter();
</script>
</body></html>`;
}
