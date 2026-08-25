// Answer-engine provider layer. Pluggable: uses whatever key is in the env,
// falls back to null (the caller then uses the keyless SERP proxy).
//
//   PERPLEXITY_API_KEY  → real citations, ideal for AEO (implemented)
//   ANTHROPIC_API_KEY   → web-search tool loop (interface reserved)
//   OPENAI_API_KEY      → web-search (interface reserved)
//
// Every provider returns the same shape so the engine never branches:
//   { engine, answer, citedDomains: string[], citesPersistence: boolean } | null

const OWN = 'persistence.dev';

// Only engines with a working web-grounded citation implementation count here.
// Anthropic/OpenAI keys drive the writer, not the citation probe (their
// web-search tool loops are reserved), so they're intentionally excluded.
export function availableEngines() {
  const e = [];
  if (process.env.PERPLEXITY_API_KEY) e.push('perplexity');
  return e;
}

// Perplexity returns citations directly in the response — perfect for AEO.
async function askPerplexity(question) {
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}` },
    body: JSON.stringify({
      model: 'sonar',
      messages: [{ role: 'user', content: question }],
      return_citations: true,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`perplexity HTTP ${res.status}`);
  const data = await res.json();
  const answer = data.choices?.[0]?.message?.content || '';
  const citations = data.citations || data.search_results?.map((s) => s.url) || [];
  const citedDomains = [...new Set(citations.map((u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; } }).filter(Boolean))];
  return { engine: 'perplexity', answer, citedDomains, citesPersistence: citedDomains.some((d) => d.includes(OWN)) };
}

// Ask every engine we have a key for. Returns [] when keyless.
export async function askEngines(question) {
  const out = [];
  for (const engine of availableEngines()) {
    try {
      if (engine === 'perplexity') out.push(await askPerplexity(question));
      // anthropic / openai web-search loops slot in here with the same return shape.
    } catch (e) {
      out.push({ engine, error: e.message });
    }
  }
  return out;
}
