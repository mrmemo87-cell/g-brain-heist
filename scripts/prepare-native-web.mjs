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

// Inside the app the page sits between the phone's status bar and gesture bar instead of under them:
// without `viewport-fit=cover`, Capacitor's SystemBars pads the web view by the real system-bar insets
// (Android), and iOS keeps content inside the safe area. Pinch-zoom is off so pages cannot pan sideways.
export const NATIVE_VIEWPORT = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';

export function nativeHtml(html) {
  return html.replace(/<meta\s+name=["']viewport["'][^>]*>/i, `<meta name="viewport" content="${NATIVE_VIEWPORT}" />`);
}

function rewriteTopLevelHtml(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
    const file = path.join(dir, entry.name);
    fs.writeFileSync(file, nativeHtml(fs.readFileSync(file, 'utf8')));
  }
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
  rewriteTopLevelHtml(target);
  const mb = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;
  console.log(`dist-native ready: ${mb(sizeOf(target))} (web build dist/: ${mb(sizeOf(source))})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
