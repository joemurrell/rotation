#!/usr/bin/env node
// Keep the service worker cache name in sync with the assets it caches.
//
// The SW is cache-first, so returning users keep getting old files until the
// CACHE name changes. This derives that name from a hash of the cached assets,
// so it updates automatically whenever any of them change — and stays stable
// when nothing did. Run by the pre-commit hook (.githooks/pre-commit); also
// runnable by hand: `node scripts/bump-sw-cache.mjs`.

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const swPath = join(root, 'service-worker.js');
const PREFIX = 'bbrotation-';

const sw = readFileSync(swPath, 'utf8');

// Pull the asset list straight out of the SW so the two never drift apart.
const assetsBlock = sw.match(/const ASSETS = \[([\s\S]*?)\];/);
if (!assetsBlock) {
  console.error('bump-sw-cache: could not find ASSETS array in service-worker.js');
  process.exit(1);
}
const assets = [...assetsBlock[1].matchAll(/'([^']+)'/g)]
  .map((m) => m[1])
  .filter((p) => p !== './' && !p.endsWith('/')); // skip directory entries

const hash = createHash('sha1');
for (const rel of assets.sort()) {
  // Resolve './styles.css' etc. relative to the repo root.
  const file = join(root, rel.replace(/^\.\//, ''));
  hash.update(rel + '\0');
  hash.update(readFileSync(file));
}
const next = PREFIX + hash.digest('hex').slice(0, 8);

const updated = sw.replace(/const CACHE = '[^']*';/, `const CACHE = '${next}';`);
if (updated === sw) {
  console.log(`bump-sw-cache: cache name already up to date (${next})`);
  process.exit(0);
}
writeFileSync(swPath, updated);
console.log(`bump-sw-cache: cache name -> ${next}`);
