const fs = require('fs');

const filePath = 'c:\\Users\\reigh\\OneDrive\\Documents\\GitHub\\g-brain-heist\\components\\CambridgeTestsHub.tsx';

// Read the file
let content = fs.readFileSync(filePath, 'utf8');

// More comprehensive patterns - trying different byte sequences
const patterns = [
  // Cyrillic-looking corrupted patterns
  [/\u0440\u0459[\u201C\u201D\u2018\u2019\u040B\u045A][\u2013\u2014\u00AD\u2022\u00B1\u00B3\u00A7\u0403\u201E\u2030\u00A7\u2013\u0404\u045C\u040B\u2018\u201D\u00AD\u0459]/g, '�'],  // Generic fix
  [/\u0432[\u045A\u040F\u2013][\u040C\u040F\u2022\u2026\u00B1\u00B3\u201D\u2014\u00B6][\u043F\u0451\u040F]?/g, '�'],  // Generic fix for v-based
  
  // Replace exact sequences found
  ['рџ"–', '📖'],
  ['рџ"љ', '📚'],  
  ['рџ"ќ', '📝'],
  ['рџ'‹', '👋'],
  ['рџ"‹', '📋'],
  ['вЏі', '⏳'],
  ['рџ"­', '🔭'],
  ['рџ"'', '📒'],
  ['рџЋ‰', '🎉'],
  ['рџ"Ѓ', '📃'],
  ['рџ"„', '📄'],
  ['вњ"', '✓'],
  ['рџ"'', '🔒'],
  ['рџ"¤', '📤'],
];

let count = 0;
for (const [pattern, replacement] of patterns) {
  const before = content;
  if (pattern instanceof RegExp) {
    content = content.replace(pattern, replacement);
  } else {
    content = content.split(pattern).join(replacement);
  }
  if (content !== before) {
    count++;
    console.log(`✓ Applied replacement #${count}`);
  }
}

// Write back
fs.writeFileSync(filePath, content, 'utf8');

console.log(`\nFixed ${count} patterns in ${filePath}`);
console.log(`New file size: ${content.length}`);
