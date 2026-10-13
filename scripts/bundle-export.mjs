#!/usr/bin/env node
// Bundles all letterboxd_export/*.csv files into a single gzip-compressed
// base64 string for the LETTERBOXD_EXPORT_BUNDLE environment variable.
//
// Usage:
//   node scripts/bundle-export.mjs
//
// Then paste the output into Vercel → Settings → Environment Variables
// as LETTERBOXD_EXPORT_BUNDLE and redeploy.

import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'letterboxd_export';
let files;
try {
  files = readdirSync(dir).filter((f) => f.endsWith('.csv'));
} catch {
  console.error(`Error: could not read ./${dir}/ — run this from the project root.`);
  process.exit(1);
}

if (files.length === 0) {
  console.error(`Error: no .csv files found in ./${dir}/`);
  process.exit(1);
}

const bundle = Object.fromEntries(
  files.map((f) => [f, readFileSync(join(dir, f), 'utf8')])
);

const compressed = gzipSync(Buffer.from(JSON.stringify(bundle)));
const b64 = compressed.toString('base64');

const raw = files.reduce((n, f) => n + readFileSync(join(dir, f)).length, 0);
console.error(`Bundled ${files.length} files  |  raw ${(raw / 1024).toFixed(1)} KB  →  ${(b64.length / 1024).toFixed(1)} KB base64`);
console.error(`Files: ${files.join(', ')}`);
console.error('');
process.stdout.write(b64 + '\n');
