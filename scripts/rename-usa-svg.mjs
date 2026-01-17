// scripts/rename-usa-svg.mjs
// Auto-rename USA.svg region IDs from US-XX -> zone-N (Option A)
// Also adds data-code="US-XX" to each renamed element
// Adds a safe fallback viewBox if missing

import fs from "node:fs";
import path from "node:path";

const SVG_PATH = path.resolve("src/features/clanTerritory/assets/USA.svg");

const mapping = [
  ["zone-1", "US-AL"],
  ["zone-2", "US-AK"],
  ["zone-3", "US-AZ"],
  ["zone-4", "US-AR"],
  ["zone-5", "US-CA"],
  ["zone-6", "US-CO"],
  ["zone-7", "US-CT"],
  ["zone-8", "US-DC"],
  ["zone-9", "US-DE"],
  ["zone-10", "US-FL"],
  ["zone-11", "US-GA"],
  ["zone-12", "US-HI"],
  ["zone-13", "US-ID"],
  ["zone-14", "US-IL"],
  ["zone-15", "US-IN"],
  ["zone-16", "US-IA"],
  ["zone-17", "US-KS"],
  ["zone-18", "US-KY"],
  ["zone-19", "US-LA"],
  ["zone-20", "US-ME"],
  ["zone-21", "US-MD"],
  ["zone-22", "US-MA"],
  ["zone-23", "US-MI"],
  ["zone-24", "US-MN"],
  ["zone-25", "US-MS"],
  ["zone-26", "US-MO"],
  ["zone-27", "US-MT"],
  ["zone-28", "US-NE"],
  ["zone-29", "US-NV"],
  ["zone-30", "US-NH"],
  ["zone-31", "US-NJ"],
  ["zone-32", "US-NM"],
  ["zone-33", "US-NY"],
  ["zone-34", "US-NC"],
  ["zone-35", "US-ND"],
  ["zone-36", "US-OH"],
  ["zone-37", "US-OK"],
  ["zone-38", "US-OR"],
  ["zone-39", "US-PA"],
  ["zone-40", "US-RI"],
  ["zone-41", "US-SC"],
  ["zone-42", "US-SD"],
  ["zone-43", "US-TN"],
  ["zone-44", "US-TX"],
  ["zone-45", "US-UT"],
  ["zone-46", "US-VT"],
  ["zone-47", "US-VA"],
  ["zone-48", "US-WA"],
  ["zone-49", "US-WV"],
  ["zone-50", "US-WI"],
  ["zone-51", "US-WY"],
];

// Escape for regex usage
const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

if (!fs.existsSync(SVG_PATH)) {
  console.error(`[rename-usa-svg] File not found: ${SVG_PATH}`);
  process.exit(1);
}

let svg = fs.readFileSync(SVG_PATH, "utf8");

let replaced = 0;
const missing = [];
const duplicates = [];

// Count occurrences helper
const countOcc = (haystack, needle) => (haystack.match(new RegExp(needle, "g")) || []).length;

// Add fallback viewBox if missing on root <svg ...>
if (!/\<svg\b[^>]*\bviewBox\s*=/.test(svg)) {
  svg = svg.replace(/\<svg\b/, `<svg viewBox="0 0 1000 600"`);
}

for (const [zoneId, code] of mapping) {
  // Match id="US-CA" (single or double quotes)
  const idRe = new RegExp(`\\bid\\s*=\\s*["']${reEscape(code)}["']`, "g");
  const occ = countOcc(svg, `\\bid\\s*=\\s*["']${reEscape(code)}["']`);

  if (occ === 0) {
    missing.push(code);
    continue;
  }
  if (occ > 1) duplicates.push(`${code} (${occ})`);

  // Replace id="US-XX" with id="zone-N"
  svg = svg.replace(idRe, `id="${zoneId}"`);

  // Add data-code="US-XX" near the id we just replaced
  // We attach it to the same element start tag by inserting after id="zone-N"
  const afterIdRe = new RegExp(`\\bid\\s*=\\s*["']${reEscape(zoneId)}["']`, "g");
  svg = svg.replace(afterIdRe, `id="${zoneId}" data-code="${code}"`);

  // Count as one replacement per code (not per occurrence) to keep summary readable
  replaced += 1;
}

fs.writeFileSync(SVG_PATH, svg, "utf8");

console.log(`[rename-usa-svg] Updated: ${SVG_PATH}`);
console.log(`[rename-usa-svg] Codes processed: ${mapping.length}`);
console.log(`[rename-usa-svg] IDs replaced: ${replaced}`);

if (missing.length) {
  console.warn(`[rename-usa-svg] Missing IDs not found in SVG (${missing.length}):`);
  console.warn(missing.join(", "));
}

if (duplicates.length) {
  console.warn(`[rename-usa-svg] Duplicate IDs found (${duplicates.length}):`);
  console.warn(duplicates.join(", "));
}

console.log("[rename-usa-svg] Done.");
