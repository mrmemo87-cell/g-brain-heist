/**
 * Extract text content from Stage 9 admission test .docx files and answer PDF
 */
const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', 'public', 'admission-tests', 'source', 'stage 9');

async function extractDocx(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

async function main() {
  // Extract EoU tests
  const eouDir = path.join(BASE, 'EoU');
  const progDir = path.join(BASE, 'prog_tests');

  console.log('========== END OF UNIT TESTS ==========\n');
  const eouFiles = fs.readdirSync(eouDir).filter(f => f.endsWith('.docx')).sort();
  for (const file of eouFiles) {
    console.log(`\n===== ${file} =====\n`);
    const text = await extractDocx(path.join(eouDir, file));
    console.log(text);
    console.log('\n' + '='.repeat(80));
  }

  console.log('\n\n========== PROGRESS TESTS ==========\n');
  const progFiles = fs.readdirSync(progDir).filter(f => f.endsWith('.docx')).sort();
  for (const file of progFiles) {
    console.log(`\n===== ${file} =====\n`);
    const text = await extractDocx(path.join(progDir, file));
    console.log(text);
    console.log('\n' + '='.repeat(80));
  }

  // Try PDF answer key
  console.log('\n\n========== ANSWER KEY (PDF) ==========\n');
  try {
    const pdfParse = require('pdf-parse');
    const pdfBuffer = fs.readFileSync(path.join(BASE, 'GE_9_test_answers.pdf'));
    const pdfData = await pdfParse(pdfBuffer);
    console.log(pdfData.text);
  } catch (err) {
    console.log('PDF parse error:', err.message);
  }
}

main().catch(console.error);
