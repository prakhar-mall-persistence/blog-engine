#!/usr/bin/env node
import '../src/lib/env.mjs';
// Run a transparent research pass on a topic.  Usage: npm run research -- "your topic"
import { research } from '../src/engine.mjs';
const topic = process.argv.slice(2).join(' ').trim();
if (!topic) { console.error('Usage: npm run research -- "voice ai for healthcare"'); process.exit(1); }
await research(topic);
