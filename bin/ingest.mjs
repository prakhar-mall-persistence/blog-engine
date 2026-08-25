#!/usr/bin/env node
import '../src/lib/env.mjs';
// Build (or rebuild) the Persistence brain.  Usage: npm run ingest
import { ingest } from '../src/brain/ingest.mjs';
await ingest();
