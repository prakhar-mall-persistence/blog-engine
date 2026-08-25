#!/usr/bin/env node
import '../src/lib/env.mjs';
// Draft a post for a target keyword.  Usage: npm run write -- "voice ai for insurance"
// Uses an existing research brief if present, else runs research first.
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { research } from '../src/engine.mjs';
import { buildPack } from '../src/writer/brief-pack.mjs';
import { write } from '../src/writer/write.mjs';
import { slugify } from '../src/writer/schema.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../output');
const target = process.argv.slice(2).join(' ').trim();
if (!target) { console.error('Usage: npm run write -- "voice ai for insurance"'); process.exit(1); }

const briefPath = join(OUT, `brief-${slugify(target)}.json`);
let brief = null;
if (existsSync(briefPath)) { brief = JSON.parse(await readFile(briefPath, 'utf8')); console.log(`Using existing brief: ${briefPath}`); }
else { console.log('No brief found — running research first…'); ({ brief } = await research(target)); }

const pack = await buildPack(target, { brief });
await write(pack);
