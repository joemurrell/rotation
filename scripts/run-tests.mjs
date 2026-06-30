#!/usr/bin/env node
// Runs every tests/*.test.html file in headless Chromium and fails the
// process if any assertion fails. These are plain ES-module pages (no test
// framework) that set window.__TESTS__ = { passed, failed } when done; we
// just need a real browser (for `import`) and a static server (ES modules
// can't load over file://).

import { createServer } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function serveStatic() {
  return createServer(async (req, res) => {
    const path = join(root, decodeURIComponent(req.url.split('?')[0]));
    try {
      const body = await readFile(path);
      res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
}

async function run() {
  const testsDir = join(root, 'tests');
  const files = (await readdir(testsDir)).filter((f) => f.endsWith('.test.html')).sort();
  if (files.length === 0) {
    console.error('No tests/*.test.html files found.');
    process.exit(1);
  }

  const server = serveStatic();
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const browser = await chromium.launch();
  let totalPassed = 0, totalFailed = 0, ok = true;

  try {
    for (const file of files) {
      const page = await browser.newPage();
      page.on('console', (msg) => {
        if (msg.type() === 'error') console.error(`  [console] ${msg.text()}`);
      });
      page.on('pageerror', (err) => console.error(`  [page error] ${err.message}`));

      await page.goto(`http://localhost:${port}/tests/${file}`);
      let result;
      try {
        result = await page.waitForFunction(() => window.__TESTS__, null, { timeout: 10000 })
          .then(() => page.evaluate(() => window.__TESTS__));
      } catch {
        ok = false;
        console.error(`✗ ${file}: timed out waiting for tests to finish`);
        await page.close();
        continue;
      }

      const { passed, failed } = result;
      totalPassed += passed; totalFailed += failed;
      console.log(`${failed === 0 ? '✓' : '✗'} ${file}: ${passed} passed, ${failed} failed`);
      if (failed > 0) ok = false;
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n${totalPassed} passed, ${totalFailed} failed across ${files.length} file(s).`);
  process.exit(ok ? 0 : 1);
}

run();
