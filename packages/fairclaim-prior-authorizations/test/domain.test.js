// Domain checks for services against the prior-authorization log and 278 responses (ver 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAuths, authList, logStatus } from '../src/logic.js';

const rules = { payers: [{ name: 'Example Health Plan', codes: ['97*', '72148'] }], warn_days: 14 };
const claim = (id, code, date, o = {}) => ({ claim_id: id, payer_name: o.payer || 'Example Health Plan', member_id: o.member ?? 'M1', patient_name: 'Pat Example', prior_auth: o.pa || null, lines: [{ code, units: o.units ?? 1, charge: o.charge ?? 100, date_from: date }] });
const log = (num, o = {}) => ({ auth_number: num, member_id: 'M1', patient_name: 'Pat Example', payer: 'Example Health Plan', codes: o.codes ?? '97110 97140', units: o.units ?? 12, from: o.from ?? '2026-01-01', to: o.to ?? '2026-06-30', status: o.status ?? 'Approved' });
const run = (claims, rows, reviews = [], asOf = '2026-02-15') => checkAuths(claims, authList(rows, reviews), { rules, asOf });
const statuses = (r) => r.items.map((i) => [i.claim_id, i.status]);

test('log statuses in everyday words: "Not approved" is denied, "In review" is pending, an unknown word is never an approval', () => {
  assert.deepEqual(['Approved', 'Not approved', 'In review', 'Voided', 'Partial approval', '', 'see notes'].map(logStatus), ['approved', 'denied', 'pending', 'cancelled', 'approved', 'approved', 'pending']);
  const r = run([claim('A', '97110', '2026-02-01'), claim('B', '97110', '2026-02-01', { member: 'M2' })], [log('PA1', { status: 'Not approved' }), { ...log('PA2', { status: 'Under review' }), member_id: 'M2' }]);
  assert.deepEqual(statuses(r), [['A', 'denied'], ['B', 'pending']]);
});

test('a 278 approval replaces the units and dates typed in the log', () => {
  const reviews = [{ trace: 'T1', member_id: 'M1', patient_name: 'Pat Example', decision: 'certified_partial', auth_number: 'pa-1', from: '2026-01-15', to: '2026-03-31', codes: ['97110'], units: 4 }];
  const list = authList([log('PA1', { units: 20 })], reviews);
  assert.deepEqual([list.length, list[0].units, list[0].from, list[0].to, list[0].review], [1, 4, '2026-01-15', '2026-03-31', 'certified_partial']);
  const r = checkAuths([1, 2, 3, 4, 5].map((i) => claim(`V${i}`, '97110', `2026-02-0${i}`)), list, { rules, asOf: '2026-02-15' });
  assert.equal(r.items.find((i) => i.claim_id === 'V5').status, 'units_exceeded');
});

test('a service needing authorization with none on file is missing; a code that needs none is skipped', () => {
  const r = run([claim('M', '72148', '2026-02-01'), claim('N', '99213', '2026-02-01')], []);
  assert.deepEqual(statuses(r), [['M', 'missing']]);
  assert.equal(r.charges_at_risk, 100);
});

test('dates and codes: before the start, after the end, a code not on the approval', () => {
  const r = run([claim('S', '97110', '2025-12-20'), claim('E', '97110', '2026-07-02'), claim('C', '97530', '2026-02-01')], [log('PA1', { from: '2026-01-01', to: '2026-06-30' })]);
  const by = Object.fromEntries(r.items.map((i) => [i.claim_id, i.status]));
  assert.deepEqual([by.S, by.E, by.C], ['not_started', 'expired', 'missing']);
  assert.match(r.items.find((i) => i.claim_id === 'C').message, /PA1 covers 97110, 97140 only/);
  const n = run([claim('C2', '97530', '2026-02-01', { pa: 'PA1' })], [log('PA1')]);
  assert.equal(n.items[0].status, 'code_not_on_auth', 'with the number on the claim the approval is found and the code is the problem');
});

test('a number on the claim that is not the logged one is a mismatch; a number on a claim that needs none is checked against the log', () => {
  const r = run([claim('X', '97110', '2026-02-01', { pa: 'PA-999' }), claim('Y', '99213', '2026-02-01', { pa: 'ZZ1' })], [log('PA1')]);
  assert.deepEqual(statuses(r), [['X', 'number_mismatch'], ['Y', 'not_in_log']]);
  assert.match(r.items[0].fix, /REF\*G1/);
});

test('running out: close to the end date or to the last units, and the right number with dashes matches', () => {
  const r = run([claim('D', '97110', '2026-02-10', { pa: 'pa 1' })], [log('PA-1', { to: '2026-02-20' })]);
  assert.deepEqual(statuses(r), [['D', 'running_out']]);
  const u = run([claim('U1', '97110', '2026-02-01', { units: 5 }), claim('U2', '97110', '2026-02-08', { units: 4 })], [log('PA1', { units: 10 })]);
  assert.deepEqual(statuses(u).sort(), [['U1', 'covered'], ['U2', 'running_out']]);
});

test('an authorization for another payer does not cover this payer\'s claim', () => {
  const r = run([claim('P', '97110', '2026-02-01')], [{ ...log('PA1'), payer: 'Sample Mutual' }]);
  assert.deepEqual(statuses(r), [['P', 'missing']]);
});
