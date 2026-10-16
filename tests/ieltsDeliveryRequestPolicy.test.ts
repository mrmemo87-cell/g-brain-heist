import test from 'node:test';
import assert from 'node:assert/strict';
import { ieltsRequestDelay } from '../services/ieltsDeliveryRequestPolicy';
test('periodic and recovery delays spread requests and bound retry growth', () => {
  for (const [operation, base] of [['save', 8000], ['status', 10000], ['recovery', 500]] as const) {
    assert.equal(ieltsRequestDelay(operation, 0, () => 0), base);
    assert.equal(ieltsRequestDelay(operation, 0, () => 1), base * 1.25);
    assert.ok(ieltsRequestDelay(operation, 2, () => 0) > base);
    assert.ok(ieltsRequestDelay(operation, 100, () => 1) <= 75000);
    assert.equal(ieltsRequestDelay(operation, -1, () => 0), base);
  }
});
