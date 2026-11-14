// New markets are Yes/No only. Run: npx tsx --test scripts/market-spec.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { binaryOutcomes } from './market-spec';

const REFUSAL = { message: 'new markets are Yes/No only: remove "outcomes" from the spec or set it to ["Yes","No"]' };

test('no outcomes means Yes/No', () => {
  assert.deepEqual(binaryOutcomes({}), ['Yes', 'No']);
});

test('["Yes","No"] is accepted', () => {
  assert.deepEqual(binaryOutcomes({ outcomes: ['Yes', 'No'] }), ['Yes', 'No']);
});

test('three outcomes are refused', () => {
  assert.throws(() => binaryOutcomes({ outcomes: ['Max Verstappen', 'George Russell', 'Another driver'] }), REFUSAL);
});

test('["No","Yes"] is refused, because the order fixes which outcome is 1', () => {
  assert.throws(() => binaryOutcomes({ outcomes: ['No', 'Yes'] }), REFUSAL);
});
