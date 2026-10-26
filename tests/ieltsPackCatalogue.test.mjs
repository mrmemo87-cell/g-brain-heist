import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const built = await build({ entryPoints: ['src/pages/ielts/ieltsPackCatalogue.ts'], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
const { packKind, packNumber, packSkill, kindLabel } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));

test('vocabulary lessons get their own library tab, label and skill', () => {
  assert.equal(packKind('IELTS-V3'), 'vocabulary');
  assert.equal(packKind('IELTS-X3'), 'extension');
  assert.equal(packKind('IELTS-M3'), 'mock');
  assert.equal(packKind('IELTS-13'), 'course');
  assert.equal(packNumber('IELTS-V6'), 'V6');
  assert.equal(kindLabel.vocabulary, 'Vocabulary lessons');
  assert.equal(packSkill('Vocabulary: describing trends and comparisons for Writing Task 1'), 'Vocabulary');
});
