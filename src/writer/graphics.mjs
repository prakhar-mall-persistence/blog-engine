// On-brand inline SVG graphics for posts. Uses the Persistence palette
// (Manrope, purple #5925DC, per-color accents, dot pattern, radius 18) so the
// output matches the live site. Each renderer returns a self-contained <svg>.
//
// The writer emits a `graphics` spec array; renderGraphic dispatches by type:
//   { type:'flow',  title, after, steps:[{label,sub}] }
//   { type:'fit',   title, after, fits:[...], avoids:[...] }
//   { type:'stats', title, after, stats:[{value,label}] }

export const ACCENTS = {
  violet: { a: '#5925DC', tint: '#ede8fb', soft: '#9879E7' },
  indigo: { a: '#4338ca', tint: '#e5e7ff', soft: '#818cf8' },
  navy:   { a: '#1d4ed8', tint: '#dbeafe', soft: '#60a5fa' },
  teal:   { a: '#0d9488', tint: '#e0faf8', soft: '#5eead4' },
  emerald:{ a: '#059669', tint: '#dcfce7', soft: '#6ee7b7' },
  amber:  { a: '#b45309', tint: '#fef3c7', soft: '#fbbf24' },
  rose:   { a: '#be123c', tint: '#ffe4ec', soft: '#fb7185' },
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const F = 'Manrope, -apple-system, BlinkMacSystemFont, sans-serif';
// naive word-wrap for SVG text (no tspan measuring available server-side)
function wrap(s, max) {
  const words = String(s).split(' ');
  const lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > max) { lines.push(cur.trim()); cur = w; } else cur += ' ' + w; }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}

function dotPattern(id, accent) {
  return `<pattern id="${id}" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="${accent}" fill-opacity="0.16"/></pattern>`;
}

// Horizontal step flow with arrows.
function flow(spec, C) {
  const steps = spec.steps.slice(0, 5);
  const W = 760, padX = 24, gap = 16;
  const cardW = (W - padX * 2 - gap * (steps.length - 1)) / steps.length;
  const H = 190;
  let cards = '';
  steps.forEach((s, i) => {
    const x = padX + i * (cardW + gap);
    const labelLines = wrap(s.label, Math.floor(cardW / 8));
    const subLines = wrap(s.sub || '', Math.floor(cardW / 6)).slice(0, 3);
    cards += `<g transform="translate(${x},46)">
      <rect width="${cardW}" height="118" rx="16" fill="#fff" stroke="${C.a}" stroke-opacity="0.18"/>
      <circle cx="22" cy="26" r="13" fill="${C.tint}"/><text x="22" y="31" font-family="${F}" font-size="13" font-weight="700" fill="${C.a}" text-anchor="middle">${i + 1}</text>
      ${labelLines.map((l, j) => `<text x="16" y="${60 + j * 17}" font-family="${F}" font-size="14" font-weight="600" fill="#0a0a0a">${esc(l)}</text>`).join('')}
      ${subLines.map((l, j) => `<text x="16" y="${60 + labelLines.length * 17 + 4 + j * 14}" font-family="${F}" font-size="11" fill="#565560">${esc(l)}</text>`).join('')}
    </g>`;
    if (i < steps.length - 1) {
      const ax = x + cardW + gap / 2;
      cards += `<path d="M${ax - 5} 105 l7 0 m-4 -4 l4 4 l-4 4" stroke="${C.a}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
  });
  return svgWrap(W, H, spec.title, C, cards);
}

// Two-column "works well / not a fit".
function fit(spec, C) {
  const W = 760, H = 60 + Math.max(spec.fits.length, spec.avoids.length) * 34 + 40;
  const colW = (W - 24 * 2 - 20) / 2;
  const col = (items, x, ok) => {
    const head = ok ? 'Works well' : 'Not a fit';
    const mark = ok
      ? `<circle cx="12" cy="-4" r="9" fill="${C.tint}"/><path d="M8 -4 l3 3 l5 -6" stroke="${C.a}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<circle cx="12" cy="-4" r="9" fill="#f2f2f4"/><path d="M9 -7 l6 6 m0 -6 l-6 6" stroke="#8a8a94" stroke-width="2" stroke-linecap="round"/>`;
    let rows = `<text x="30" y="0" font-family="${F}" font-size="13" font-weight="700" fill="${ok ? C.a : '#8a8a94'}" letter-spacing="0.04em">${head.toUpperCase()}</text>`;
    items.slice(0, 6).forEach((it, i) => {
      const y = 30 + i * 34;
      rows += `<g transform="translate(0,${y})">${mark}${wrap(it, Math.floor(colW / 7)).slice(0, 2).map((l, j) => `<text x="30" y="${j * 15}" font-family="${F}" font-size="13" fill="#0a0a0a">${esc(l)}</text>`).join('')}</g>`;
    });
    return `<g transform="translate(${x},58)">${rows}</g>`;
  };
  const body = `<rect x="24" y="46" width="${colW}" height="${H - 60}" rx="16" fill="${C.tint}" fill-opacity="0.4"/>
    <rect x="${24 + colW + 20}" y="46" width="${colW}" height="${H - 60}" rx="16" fill="#f8f8fa"/>
    ${col(spec.fits, 40, true)}${col(spec.avoids, 24 + colW + 36, false)}`;
  return svgWrap(W, H, spec.title, C, body);
}

// Big-number stat strip.
function stats(spec, C) {
  const items = spec.stats.slice(0, 4);
  const W = 760, H = 150, padX = 24, gap = 16;
  const cardW = (W - padX * 2 - gap * (items.length - 1)) / items.length;
  let cards = '';
  items.forEach((s, i) => {
    const x = padX + i * (cardW + gap);
    cards += `<g transform="translate(${x},46)">
      <rect width="${cardW}" height="82" rx="16" fill="${C.tint}" fill-opacity="0.5"/>
      <text x="20" y="42" font-family="${F}" font-size="30" font-weight="800" fill="${C.a}" letter-spacing="-0.02em">${esc(s.value)}</text>
      ${wrap(s.label, Math.floor(cardW / 6)).slice(0, 2).map((l, j) => `<text x="20" y="${60 + j * 14}" font-family="${F}" font-size="12" fill="#565560">${esc(l)}</text>`).join('')}
    </g>`;
  });
  return svgWrap(W, H, spec.title, C, cards);
}

function svgWrap(W, H, title, C, body) {
  const pid = 'dp' + Math.floor(W + H + title.length);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}">
    <defs>${dotPattern(pid, C.a)}</defs>
    <rect width="${W}" height="${H}" rx="20" fill="#fff" stroke="${C.a}" stroke-opacity="0.12"/>
    <rect width="${W}" height="${H}" rx="20" fill="url(#${pid})"/>
    <text x="24" y="30" font-family="${F}" font-size="13" font-weight="700" fill="#0a0a0a" letter-spacing="0.02em">${esc(title)}</text>
    ${body}
  </svg>`;
}

export function renderGraphic(spec, imageColor = 'violet') {
  const C = ACCENTS[imageColor] || ACCENTS.violet;
  try {
    if (spec.type === 'flow' && spec.steps?.length) return flow(spec, C);
    if (spec.type === 'fit' && (spec.fits?.length || spec.avoids?.length)) return fit({ fits: spec.fits || [], avoids: spec.avoids || [], title: spec.title }, C);
    if (spec.type === 'stats' && spec.stats?.length) return stats(spec, C);
  } catch { /* skip a malformed graphic rather than break the post */ }
  return null;
}

// Upgraded hero: gradient wash + dot field + soft waveform, tinted per color.
export function heroGraphic(imageColor = 'violet') {
  const C = ACCENTS[imageColor] || ACCENTS.violet;
  let bars = '';
  for (let i = 0; i < 48; i++) {
    const h = 16 + Math.abs(Math.sin(i * 0.5) * 70) + (i % 4) * 6;
    bars += `<rect x="${30 + i * 19}" y="${150 - h / 2}" width="7" height="${h}" rx="3.5" fill="${C.a}" opacity="${0.2 + (i % 6) * 0.11}"/>`;
  }
  return `<svg viewBox="0 0 960 300" width="100%" xmlns="http://www.w3.org/2000/svg" style="display:block">
    <defs>
      <linearGradient id="hg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.a}" stop-opacity="0.16"/><stop offset="1" stop-color="${C.a}" stop-opacity="0.02"/></linearGradient>
      ${dotPattern('hdp', C.a)}
    </defs>
    <rect width="960" height="300" fill="url(#hg)"/><rect width="960" height="300" fill="url(#hdp)"/>
    <g>${bars}</g>
  </svg>`;
}
