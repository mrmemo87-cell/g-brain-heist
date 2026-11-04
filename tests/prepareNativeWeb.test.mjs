import test from 'node:test';
import assert from 'node:assert/strict';
import { shipsInApp } from '../scripts/prepare-native-web.mjs';

test('native app bundle keeps everything the app loads', () => {
  for (const kept of [
    'index.html',
    'assets/index-abc123.js',
    'admission-tests/admission-test.html',
    'admission-tests/pools/stage7.json',
    'components/Biology/biology_ch3_extraction_delimiter_clean/biology_ch3_questions.json',
    'components/Biology/biology_ch3_extraction_delimiter_clean/images/ch3_q033_9700_s19_qp_12_10.png',
    'cambridge-tests/Biology/enzymes.html',
  ]) assert.equal(shipsInApp(kept), true, kept);
});

test('native app bundle drops sources, answer keys, reports and source maps', () => {
  for (const dropped of [
    'admission-tests/source/',
    'admission-tests/source/stage 9/GE_9_test_answers.pdf',
    'assets/index-abc123.js.map',
    'components/Biology/biology_ch3_extraction_delimiter_clean/biologyCh3Questions.ts',
    'components/Biology/biology_ch3_extraction_delimiter_clean/CROP_REPORT.json',
    'components/Biology/README.md',
    'cambridge-tests/Biology/[CH1] 9700 BIOLOGY P1.pdf',
  ]) assert.equal(shipsInApp(dropped), false, dropped);
});
