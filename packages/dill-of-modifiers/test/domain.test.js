// Domain checks for modifiers on claim lines (ver 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkModifiers } from '../src/logic.js';

const claim = (lines, o = {}) => ({ claim_id: o.id || 'c1', payer_name: o.payer || 'Example Health Plan', lines: lines.map(([code, mods, extra = {}], i) => ({ line: i + 1, code, modifiers: mods, date_from: '2026-01-01', units: 1, ...extra })) });
const checks = (r) => r.issues.map((i) => i.check).sort();

test('E/M with a minor procedure needs 25; lower-case 25 counts; a different day does not need it', () => {
  assert.deepEqual(checks(checkModifiers([claim([['99213', []], ['11102', []]])])), ['em_needs_25']);
  assert.deepEqual(checks(checkModifiers([claim([['99213', ['25']], ['11102', []]])])), []);
  assert.deepEqual(checks(checkModifiers([claim([['99213', ['25'.toLowerCase()]], ['11102', []]])])), []);
  assert.deepEqual(checks(checkModifiers([claim([['99213', []], ['11102', [], { date_from: '2026-01-02' }]])])), []);
});

test('25 or 57 on a procedure line is an error, and 25 with 57 on one E/M is a conflict', () => {
  const r = checkModifiers([claim([['99214', ['25', '57']], ['20610', ['25']], ['27447', ['57']]])]);
  assert.deepEqual(checks(r), ['conflicting_pair', 'wrong_code_25', 'wrong_code_57']);
});

test('anesthesia and equipment modifiers that cannot share a line are conflicts', () => {
  const r = checkModifiers([claim([['00790', ['AA', 'QY']], ['00790', ['QK', 'QY']], ['00790', ['AA', 'QZ']], ['E0601', ['NU', 'RR']], ['E0601', ['RR', 'UE']], ['00790', ['QY', 'P1']]])]);
  assert.equal(r.by_check.conflicting_pair, 5);
  assert.equal(r.issues.filter((i) => i.line === 6).length, 0, 'QY with a physical status modifier is fine');
});

test('59 and an X modifier together is redundant; 50 with more than one unit is a warning', () => {
  const r = checkModifiers([claim([['20610', ['59', 'XS']], ['20610', ['50'], { units: 2 }]])]);
  assert.deepEqual(r.issues.map((i) => [i.check, i.severity]), [['distinct_redundant', 'warning'], ['bilateral_units', 'warning']]);
});

test('91 next to the first test on the same day is fine; on its own it is flagged', () => {
  assert.deepEqual(checks(checkModifiers([claim([['80053', []], ['80053', ['91']]])])), []);
  assert.deepEqual(checks(checkModifiers([claim([['80053', []], ['80053', ['91'], { date_from: '2026-01-02' }]])])), ['repeat_without_first']);
});

test('payer rules: not accepted and needs one of, matched by payer name and code pattern; a rule with no modifiers is skipped', () => {
  const config = { rules: [{ payer: 'example health plan', action: 'not_accepted', modifiers: ['59'], codes: ['97*'], note: 'use XU' }, { payer: 'Example Health Plan', action: 'needs_one_of', modifiers: ['gp', 'GO'], codes: ['97110'] }, { payer: 'Example Health Plan', action: 'needs_one_of', codes: ['97140'] }] };
  const r = checkModifiers([claim([['97110', ['59']], ['97140', []], ['20610', ['59']]]), claim([['97110', ['59']]], { id: 'c2', payer: 'Sample Mutual' })], { config });
  assert.deepEqual(r.issues.map((i) => [i.claim_id, i.line, i.check]), [['c1', 1, 'payer_not_accepted'], ['c1', 1, 'payer_needs_one_of']]);
  assert.match(r.issues.find((i) => i.check === 'payer_not_accepted').message, /does not accept 59: use XU/);
  assert.match(r.issues.find((i) => i.check === 'payer_needs_one_of').message, /one of GP, GO on 97110/);
});

test('clean claims are counted, and an unknown modifier is only a warning', () => {
  const r = checkModifiers([claim([['99213', []]]), claim([['99213', ['ZZ']]], { id: 'c2' })]);
  assert.deepEqual([r.claims, r.clean_claims, r.errors, r.warnings], [2, 1, 0, 1]);
});
