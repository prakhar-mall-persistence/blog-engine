#!/usr/bin/env node
import '../src/lib/env.mjs';
// Publish a drafted post. Safe by default (dry-run). Add --pr to open a real PR.
//   npm run publish -- "voice ai for insurance"          # dry-run
//   npm run publish -- "voice ai for insurance" --pr     # open PR (needs GITHUB_TOKEN)
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { publish } from '../src/publish/github.mjs';
import { requestApproval } from '../src/publish/slack.mjs';
import { slugify } from '../src/writer/schema.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../output');
const args = process.argv.slice(2);
const live = args.includes('--pr');
const notify = args.includes('--slack');
const topic = args.filter((a) => !a.startsWith('--')).join(' ').trim();
if (!topic) { console.error('Usage: npm run publish -- "topic" [--pr] [--slack]'); process.exit(1); }

const f = join(OUT, `post-${slugify(topic)}.json`);
if (!existsSync(f)) { console.error(`No drafted post at ${f}. Run: npm run write -- "${topic}"`); process.exit(1); }
const { post } = JSON.parse(await readFile(f, 'utf8'));

if (notify) await requestApproval(post, { previewUrl: `${process.env.PUBLIC_BASE_URL || 'http://localhost:8788'}/preview/${post.slug}` });
await publish(post, { mode: live ? 'live' : 'dry' });
if (!live) console.log('\nℹ️  Dry-run. Re-run with --pr to open a real PR against astro-web.');
