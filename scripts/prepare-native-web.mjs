#!/usr/bin/env node
// Copy the web build (dist/) into dist-native/, the folder Capacitor ships inside the iPhone/Android apps,
// leaving out files the apps never load. The website build in dist/ is not changed.
//
// Usage: node scripts/prepare-native-web.mjs   (run after `npm run build`; `npm run native:sync` does both)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'dist');
const target = path.join(root, 'dist-native');

// Paths are relative to dist/, with forward slashes.
export const EXCLUDED_PREFIXES = [
  // Original Word/PDF sources and answer keys for admission tests; the test page uses admission-tests/pools.
  'admission-tests/source/',
];
const EXCLUDED_FILE = [
  /\.map$/i, // source maps
  /^components\/Biology\/.*\.(ts|md)$/i, // question-bank source copies (the app reads the .json and images)
  /^components\/Biology\/.*_REPORT\.json$/i, // extraction QA reports
  /^cambridge-tests\/.*\.pdf$/i, // full past-paper PDFs; the tests use their own HTML pages and images
];

export function shipsInApp(relativePath) {
  const rel = relativePath.split(path.sep).join('/');
  if (EXCLUDED_PREFIXES.some((prefix) => rel.startsWith(prefix))) return false;
  return !EXCLUDED_FILE.some((pattern) => pattern.test(rel));
}

function sizeOf(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? sizeOf(full) : fs.statSync(full).size;
  }
  return total;
}

function main() {
  if (!fs.existsSync(path.join(source, 'index.html'))) {
    console.error('dist/index.html not found. Run `npm run build` first.');
    process.exit(1);
  }
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(source, src);
      if (!rel) return true;
      // Folders: skip excluded ones entirely; otherwise descend and judge each file.
      if (fs.statSync(src).isDirectory()) return shipsInApp(`${rel}/`);
      return shipsInApp(rel);
    },
  });
  const mb = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;
  console.log(`dist-native ready: ${mb(sizeOf(target))} (web build dist/: ${mb(sizeOf(source))})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
