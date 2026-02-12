const { PDFParse } = require('pdf-parse');
const fs = require('fs');
const path = require('path');

async function main() {
  const buf = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'admission-tests', 'source', 'stage 9', 'GE_9_test_answers.pdf')
  );
  const parser = new PDFParse();
  const result = await parser.parseBuffer(buf);
  // Try different methods
  console.log('Keys:', Object.keys(result));
  if (result.text) console.log(result.text);
  else if (result.pages) {
    for (const page of result.pages) {
      console.log('--- Page ---');
      if (page.text) console.log(page.text);
      else if (page.lines) {
        for (const line of page.lines) {
          console.log(line.text || line.toString());
        }
      } else {
        console.log(JSON.stringify(page).substring(0, 2000));
      }
    }
  } else {
    console.log(JSON.stringify(result).substring(0, 5000));
  }
}

main().catch(e => {
  console.error('Error:', e.message);
  // Fallback: just try every function on PDFParse
  const p = new PDFParse();
  console.log('Methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(p)));
});
