// Domain checks for registration data and likely duplicate charts (ver 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRegistrations, duplicates, mbiValid } from '../src/logic.js';

let n = 0; // each chart gets its own birth date so the fixtures are not duplicates of each other
const reg = (mrn, o = {}) => ({ mrn, patient_name: o.name || `Pat Example ${mrn}`, dob: `${1950 + (n++ % 50)}-05-05`, payer: 'Example Health Plan', member_id: 'EHP123456789', relationship: 'Self', zip: '43004', state: 'OH', phone: '614-555-0100', verified: '2026-01-10', guarantor: 'Self', ...o });
const run = (rows, config = {}) => checkRegistrations(rows, { config, asOf: '2026-02-15' });
const checks = (r, mrn) => r.issues.filter((i) => i.mrn === mrn).map((i) => i.check).sort();

test('an MBI with spaces or dashes is read as the same MBI; an old SSN-based number is not one', () => {
  assert.ok(mbiValid('1EG4 TE5 MK73'));
  assert.ok(mbiValid('1EG4-TE5-MK73'));
  const r = run([reg('1', { payer: 'Medicare', member_id: '1EG4 TE5 MK73' }), reg('2', { payer: 'Medicare', member_id: '123456789A' })], { payers: [{ name: 'Medicare', id_format: 'mbi' }] });
  assert.deepEqual(checks(r, '1'), []);
  assert.deepEqual(checks(r, '2'), ['mbi_format']);
});

test('birth dates: unreadable, future and over 115 are each caught', () => {
  const r = run([reg('a', { dob: 'not a date' }), reg('b', { dob: '2027-01-01' }), reg('c', { dob: '1900-01-01' })]);
  assert.deepEqual([checks(r, 'a'), checks(r, 'b'), checks(r, 'c')], [['missing_dob'], ['dob_future'], ['dob_implausible']]);
  assert.match(r.issues.find((i) => i.mrn === 'a').message, /could not be read/);
});

test('a dependent needs the subscriber name and birth date; self with another subscriber name is a warning', () => {
  const r = run([reg('d', { relationship: 'Child', subscriber_name: 'Sam Example' }), reg('s', { relationship: '18', subscriber_name: 'Someone Different' }), reg('ok', { relationship: 'Spouse', subscriber_name: 'Sam Example', subscriber_dob: '1979-01-01' })]);
  assert.deepEqual(checks(r, 'd'), ['subscriber_missing']);
  assert.match(r.issues.find((i) => i.mrn === 'd').message, /birth date is missing/);
  assert.deepEqual(checks(r, 's'), ['subscriber_mismatch']);
  assert.deepEqual(checks(r, 'ok'), []);
});

test('coverage ended, the same plan twice, and an old verification are found; self-pay skips insurance checks', () => {
  const r = run([reg('e', { coverage_end: '2026-01-31' }), reg('t', { secondary_payer: 'EXAMPLE HEALTH PLAN', secondary_member_id: 'ehp123456789' }), reg('v', { verified: '2024-12-01' }), reg('sp', { payer: 'Self-pay', member_id: '', verified: '2020-01-01' })]);
  assert.deepEqual([checks(r, 'e'), checks(r, 't'), checks(r, 'v'), checks(r, 'sp')], [['coverage_ended'], ['same_plan_twice'], ['not_verified'], []]);
});

test('a minor needs a guarantor; contact fields are checked and a four-digit ZIP is explained', () => {
  const r = run([reg('m', { dob: '2015-03-01', guarantor: '' }), reg('z', { zip: '2134', state: 'Ohio', phone: '555-0100' })]);
  assert.deepEqual(checks(r, 'm'), ['minor_no_guarantor']);
  assert.deepEqual(checks(r, 'z'), ['phone_format', 'state_format', 'zip_format']);
  assert.match(r.issues.find((i) => i.check === 'zip_format').message, /lost its leading zero/);
});

test('duplicates: exact repeats pair with the first chart, near names are scored, a different birth date never pairs', () => {
  const d = duplicates([
    { mrn: '1', patient_name: 'Jordan Example', dob: '1990-01-01' }, { mrn: '2', patient_name: 'JORDAN  EXAMPLE', dob: '1990-01-01' }, { mrn: '3', patient_name: 'Jordan Example', dob: '1990-01-01' },
    { mrn: '4', patient_name: 'Jordan Exampel', dob: '1990-01-01' }, { mrn: '5', patient_name: 'Jordan Example', dob: '1991-01-01' },
  ]);
  assert.deepEqual(d.filter((x) => x.score === 1).map((x) => [x.a.mrn, x.b.mrn]), [['1', '2'], ['1', '3']]);
  assert.ok(d.some((x) => x.b.mrn === '4' && x.score < 1));
  assert.ok(!d.some((x) => x.a.mrn === '5' || x.b.mrn === '5'));
});

test('a member id pattern from the config is checked without spaces or dashes', () => {
  const r = run([reg('p', { member_id: 'EHP 123-456-789' }), reg('q', { member_id: '123456789' })], { payers: [{ name: 'Example Health Plan', member_id_pattern: 'EHP\\d{9}' }] });
  assert.deepEqual([checks(r, 'p'), checks(r, 'q')], [[], ['member_id_pattern']]);
});
