const fs = require('fs');

// Check the HTML file's QUIZ_BASE_NAME
const html = fs.readFileSync('public/cambridge-tests/Chemistry/atomic_structure.html', 'utf8');
const m = html.match(/QUIZ_BASE_NAME\s*=\s*'([^']+)'/);
if (m) {
  console.log('HTML QUIZ_BASE_NAME:', JSON.stringify(m[1]));
  for (let i = 0; i < m[1].length; i++) {
    const c = m[1].charCodeAt(i);
    if (c > 127) {
      console.log(`  char[${i}] = U+${c.toString(16).toUpperCase()} (${m[1][i]})`);
    }
  }
}

// Check the answer key file
const keys = fs.readFileSync('components/chemistryAnswerKeys.ts', 'utf8');
const km = keys.match(/'AS Chemistry (.) Atomic Structure'/);
if (km) {
  console.log('\nAnswer key dash:', JSON.stringify(km[1]), 'U+' + km[1].charCodeAt(0).toString(16).toUpperCase());
}

// Check the quiz_name format as submitted
console.log('\nExpected DB quiz_name: "AS Chemistry ' + m[1].split('Chemistry ')[1] + ' (Part 2)"');
