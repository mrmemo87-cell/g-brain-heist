const PDFParser = require('pdf2json');
const fs = require('fs');
const path = require('path');

const pdfPath = path.join(__dirname, '..', 'public', 'admission-tests', 'source', 'stage 9', 'GE_9_test_answers.pdf');

const parser = new PDFParser();

parser.on('pdfParser_dataError', err => {
  console.error('Error:', err.parserError);
});

parser.on('pdfParser_dataReady', pdfData => {
  // Extract text from all pages
  let text = '';
  for (const page of pdfData.Pages) {
    for (const textItem of page.Texts) {
      for (const run of textItem.R) {
        text += decodeURIComponent(run.T) + ' ';
      }
    }
    text += '\n--- PAGE BREAK ---\n';
  }
  fs.writeFileSync(path.join(__dirname, 'answer_key_stage9.txt'), text, 'utf8');
  console.log('Written', text.length, 'chars');
});

parser.loadPDF(pdfPath);
