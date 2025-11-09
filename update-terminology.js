#!/usr/bin/env node

/**
 * Hack to Attack Terminology Update Script
 * Updates all "hack" terminology to "attack" throughout the G-Brains Heist codebase
 */

const fs = require('fs');
const path = require('path');

// File extensions to process
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.sql', '.md'];

// Files to exclude from processing
const EXCLUDE_FILES = [
  'node_modules',
  '.git',
  'HACK_TO_ATTACK_UPDATE_PLAN.md',
  'update-terminology.js'
];

// Terminology mappings
const REPLACEMENTS = [
  // Function names and identifiers
  { from: 'performHackAttempt', to: 'performAttackAttempt' },
  { from: 'rpc_hack_attempt', to: 'rpc_attack_attempt' },
  { from: 'simulateHackAttempt', to: 'simulateAttackAttempt' },
  { from: 'HackIcon', to: 'AttackIcon' },
  { from: 'hack_win', to: 'attack_win' },
  { from: 'hack_fail', to: 'attack_fail' },
  
  // User-facing text (preserve capitalization)
  { from: "Let's hack", to: "Let's attack" },
  { from: "hacked you", to: "attacked you" },
  { from: "failed to hack", to: "failed to attack" },
  { from: "Hack Rival", to: "Attack Rival" },
  { from: "PvP hacks", to: "PvP attacks" },
  { from: "PvP hack", to: "PvP attack" },
  { from: "hack attempt", to: "attack attempt" },
  { from: "Hack attempt", to: "Attack attempt" },
  { from: "hack rivals", to: "attack rivals" },
  { from: "hack targets", to: "attack targets" },
  { from: "hack some", to: "attack some" },
  { from: "Successfully hack", to: "Successfully attack" },
  { from: "incoming hack", to: "incoming attack" },
  { from: "hack you", to: "attack you" },
  
  // General terms
  { from: "hacker skills", to: "attacker skills" },
  { from: "hacker!", to: "attacker!" },
  { from: "Good luck, hacker", to: "Good luck, attacker" },
  { from: "Welcome Hacker", to: "Welcome Attacker" },
  { from: "Rich Hacker", to: "Rich Attacker" },
  { from: "First Hack", to: "First Attack" },
  { from: "hacking tools", to: "attacking tools" },
  { from: "hacking", to: "attacking" },
  { from: "Hacking", to: "Attacking" },
  
  // Technical terms in comments and descriptions
  { from: "Advanced hacking", to: "Advanced attacking" },
  { from: "Bypasses an active enemy shield during a hack", to: "Bypasses an active enemy shield during an attack" },
  
  // Documentation terms
  { from: "hack_attempt", to: "attack_attempt" },
  { from: "Hack attempt", to: "Attack attempt" },
  { from: "hack opponent", to: "attack opponent" },
  { from: "hack another", to: "attack another" },
  { from: "hack player", to: "attack player" },
  { from: "hacks (", to: "attacks (" },
  { from: "Hacks ", to: "Attacks " },
];

function shouldProcessFile(filePath) {
  // Check if file has allowed extension
  const hasValidExtension = EXTENSIONS.some(ext => filePath.endsWith(ext));
  if (!hasValidExtension) return false;
  
  // Check if file is in exclude list
  const isExcluded = EXCLUDE_FILES.some(exclude => filePath.includes(exclude));
  if (isExcluded) return false;
  
  return true;
}

function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let hasChanges = false;
    
    // Apply all replacements
    for (const replacement of REPLACEMENTS) {
      const before = content;
      content = content.replaceAll(replacement.from, replacement.to);
      if (content !== before) {
        hasChanges = true;
        console.log(`  ✓ Replaced "${replacement.from}" → "${replacement.to}"`);
      }
    }
    
    // Write back if changes were made
    if (hasChanges) {
      fs.writeFileSync(filePath, content, 'utf8');
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`  ❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

function processDirectory(dirPath) {
  const items = fs.readdirSync(dirPath);
  let totalFiles = 0;
  let changedFiles = 0;
  
  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      // Recursively process subdirectories
      if (shouldProcessFile(fullPath)) {
        const [subFiles, subChanged] = processDirectory(fullPath);
        totalFiles += subFiles;
        changedFiles += subChanged;
      }
    } else if (shouldProcessFile(fullPath)) {
      console.log(`Processing: ${fullPath}`);
      totalFiles++;
      
      if (processFile(fullPath)) {
        changedFiles++;
      }
    }
  }
  
  return [totalFiles, changedFiles];
}

function main() {
  console.log('🚀 Starting Hack → Attack Terminology Update');
  console.log('=====================================\n');
  
  const startTime = Date.now();
  const workspaceRoot = process.cwd();
  
  console.log(`Workspace: ${workspaceRoot}\n`);
  
  const [totalFiles, changedFiles] = processDirectory(workspaceRoot);
  
  const duration = Date.now() - startTime;
  
  console.log('\n=====================================');
  console.log('✅ Terminology Update Complete!');
  console.log(`📁 Files Processed: ${totalFiles}`);
  console.log(`📝 Files Changed: ${changedFiles}`);
  console.log(`⏱️  Duration: ${duration}ms`);
  console.log('\n🎯 Next Steps:');
  console.log('1. Review changes with git diff');
  console.log('2. Update audio files (hack_win.mp3 → attack_win.mp3)');
  console.log('3. Test PvP functionality');
  console.log('4. Update database RPC function names');
  console.log('5. Run full application test');
}

if (require.main === module) {
  main();
}

module.exports = { processFile, shouldProcessFile };