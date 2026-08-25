#!/usr/bin/env node
import '../src/lib/env.mjs';
// Render the redesigned blog index from the real posts.ts + engine drafts.
// Usage: npm run index
import { buildIndex } from '../src/writer/index-preview.mjs';
const { out, count } = await buildIndex();
console.log(`✅  Redesigned index: ${count} posts → ${out.split('/').slice(-2).join('/')}`);
