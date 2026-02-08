const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'components', 'CambridgeTestsHub.tsx');

// Read the file
let content = fs.readFileSync(filePath, 'utf8');

// Mapping of corrupted sequences to proper emojis
const replacements = {
  'рџ"–': '📖',  // Reading
  'рџЋ§': '🏧',  // Listening
  'вњЌпёЏ': '✌️',  // Grammar
  'рџ"љ': '📚',  // Vocabulary
  'вњЏпёЏ': '✏️',  // Writing
  'рџ§Є': '🧪',  // Science
  'рџ"ќ': '📝',  // Default
  'вњ•': '✕',  // Exit
  'рџ'‹': '👋',  // Welcome
  'рџ"‹': '📋',  // All
  'вЏі': '⏳',  // Pending
  'вњ…': '✅',  // Completed
  'рџ"­': '🔭',  // Telescope
  'рџ"'': '📒',  // Notebook
  'рџЋ‰': '🎉',  // Party
  'рџ"Ѓ': '📃',  // Page
  'рџ"„': '📄',  // Document
  'в–¶пёЏ': '▶️',  // Play
  'вњ"': '✓',  // Check
  'вЏ±пёЏ': '⏱️',  // Timer
  'рџ"'': '🔒',  // Lock
};

// Apply all replacements
let count = 0;
for (const [corrupted, proper] of Object.entries(replacements)) {
  const before = content;
  content = content.split(corrupted).join(proper);
  if (content !== before) {
    count++;
    console.log(`✓ Replaced: ${corrupted} → ${proper}`);
  }
}

// Write back
fs.writeFileSync(filePath, content, 'utf8');

console.log(`\n✅ Fixed ${count} different emoji types in ${filePath}`);
