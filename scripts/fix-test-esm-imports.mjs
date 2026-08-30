import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const outputRoot = path.resolve(process.argv[2] || 'dist-tests');
const relativeSpecifierPattern = /((?:from\s+|import\s*\(\s*|import\s+)(['"]))(\.\.?\/[^'"\n]+)(\2)/g;

const resolveEmittedSpecifier = (filePath, specifier) => {
  if (path.extname(specifier) || specifier.includes('?') || specifier.includes('#')) return specifier;

  const target = path.resolve(path.dirname(filePath), specifier);
  if (existsSync(`${target}.js`)) return `${specifier}.js`;
  if (existsSync(path.join(target, 'index.js'))) return `${specifier.replace(/\/$/, '')}/index.js`;
  return specifier;
};

const emittedJavaScriptFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const entryPath = path.join(directory, entry.name);
  if (entry.isDirectory()) return emittedJavaScriptFiles(entryPath);
  return entry.isFile() && entry.name.endsWith('.js') ? [entryPath] : [];
});

if (!existsSync(outputRoot) || !statSync(outputRoot).isDirectory()) {
  throw new Error(`Compiled test output was not found: ${outputRoot}`);
}

let updatedFiles = 0;
for (const filePath of emittedJavaScriptFiles(outputRoot)) {
  const source = readFileSync(filePath, 'utf8');
  const updated = source.replace(relativeSpecifierPattern, (match, prefix, quote, specifier, closingQuote) => (
    `${prefix}${resolveEmittedSpecifier(filePath, specifier)}${closingQuote}`
  ));
  if (updated === source) continue;
  writeFileSync(filePath, updated);
  updatedFiles += 1;
}

console.log(`Resolved relative ESM imports in ${updatedFiles} compiled test file${updatedFiles === 1 ? '' : 's'}.`);
