const fs = require('fs');

const filePath = 'c:\\Users\\reigh\\OneDrive\\Documents\\GitHub\\g-brain-heist\\components\\CambridgeTestsHub.tsx';

// Read as buffer first
let content = fs.readFileSync(filePath, 'utf8');

// Check for corrupted patterns and replace
let originalLength = content.length;

// Replace using simple string replacement
content = content.split('\u0440\u0459\u201C\u2013').join('\uD83D\uDCD6'); // Reading book
content = content.split('\u0440\u0459\u040B\u00A7').join('\uD83C\uDFE7'); // ATM  
content = content.split('\u0432\u045A\u040C\u043F\u0451\u040F').join('\u270C\uFE0F'); // Peace
content = content.split('\u0440\u0459\u201C\u0459').join('\uD83D\uDCDA'); // Books
content = content.split('\u0432\u045A\u040F\u043F\u0451\u040F').join('\u270F\uFE0F'); // Pencil
content = content.split('\u0440\u0459\u00A7\u0404').join('\uD83E\uDDEA'); // Test tube
content = content.split('\u0440\u0459\u201C\u045C').join('\uD83D\uDCDD'); // Memo
content = content.split('\u0432\u045A\u2022').join('\u2715'); // X
content = content.split('\u0440\u0459\u2018\u040B').join('\uD83D\uDC4B'); // Wave
content = content.split('\u0440\u0459\u201C\u040B').join('\uD83D\uDCCB'); // Clipboard
content = content.split('\u0432\u040F\u00B3').join('\u23F3'); // Hourglass
content = content.split('\u0432\u045A\u2026').join('\u2705'); // Checkmark
content = content.split('\u0440\u0459\u201C\u00AD').join('\uD83D\uDD2D'); // Telescope
content = content.split('\u0440\u0459\u201C\u2018').join('\uD83D\uDCD2'); // Ledger
content = content.split('\u0440\u0459\u040B\u2030').join('\uD83C\uDF89'); // Party popper
content = content.split('\u0440\u0459\u201C\u0403').join('\uD83D\uDCC3'); // Page
content = content.split('\u0440\u0459\u201C\u201E').join('\uD83D\uDCC4'); // Document
content = content.split('\u0432\u2013\u00B6\u043F\u0451\u040F').join('\u25B6\uFE0F'); // Play button
content = content.split('\u0432\u045A\u201D').join('\u2713'); // Check
content = content.split('\u0432\u040F\u00B1\u043F\u0451\u040F').join('\u23F1\uFE0F'); // Stopwatch
content = content.split('\u0440\u0459\u201C\u2018').join('\uD83D\uDD12'); // Lock

fs.writeFileSync(filePath, content, 'utf8');

console.log(`Fixed emojis. File size: ${originalLength} → ${content.length}`);
