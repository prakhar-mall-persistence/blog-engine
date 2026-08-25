// Retrieve the most relevant Persistence content for a query — the "understand"
// step. BM25 over the ingested chunks. This is what keeps posts on-brand and
// factually grounded in what Persistence actually says.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tokenize } from './ingest.mjs';

const BRAIN_PATH = join(dirname(fileURLToPath(import.meta.url)), '../../data/brain.json');
let cache = null;

export async function loadBrain() {
  if (!cache) cache = JSON.parse(await readFile(BRAIN_PATH, 'utf8'));
  return cache;
}

// BM25 scoring.
export async function retrieve(query, k = 6) {
  const brain = await loadBrain();
  const { docs, df, N, avgLen } = brain;
  const q = [...new Set(tokenize(query))];
  const k1 = 1.5, b = 0.75;
  const scored = docs.map((d) => {
    let s = 0;
    for (const term of q) {
      const f = d.tf[term] || 0;
      if (!f) continue;
      const idf = Math.log(1 + (N - (df[term] || 0) + 0.5) / ((df[term] || 0) + 0.5));
      s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * (d.len / avgLen)));
    }
    return { url: d.url, title: d.title, text: d.text, score: s };
  });
  return scored.sort((a, b) => b.score - a.score).filter((d) => d.score > 0).slice(0, k);
}

export async function brainStats() {
  return (await loadBrain()).stats;
}
export async function allPosts() {
  return (await loadBrain()).pages.filter((p) => p.isPost);
}
