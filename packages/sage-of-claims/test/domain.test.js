// Domain checks for the claim scrubber (ver 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupClaims } from 'remedy-core';
import { scrubClaims, memberPattern } from '../src/logic.js';

const row = (o = {}) => ({ claim_id: 'X1', patient_name: 'Pat Example', patient_dob: '1980-01-01', member_id: 'EHP123456789', payer: 'Example Health Plan', payer_id: '00001', billing_npi: '1234567893', pos: '11', date_of_service: '2026-01-05', code: '99213', units: 1, charge: 100, dx_1: 'J06.9', dx_pointer: '1', ...o });
const checks = (rows, opts = {}) => scrubClaims(groupClaims(rows), { asOf: '2026-01-10', ...opts }).findings.map((f) => f.check).sort();
const cfg = { payers: [{ name: 'Example Health Plan', member_id_pattern: 'EHP\\d{9}', prior_auth_codes: ['7*'], timely_days: 90 }] };

test('a member id pattern ignores spaces and dashes, and a slow or broken pattern is refused with a readable error', () => {
  assert.deepEqual(checks([row({ member_id: 'EHP 123-456-789' })], { config: cfg }), []);
  assert.deepEqual(checks([row({ member_id: '123456789' })], { config: cfg }), ['member_id_pattern']);
  assert.throws(() => memberPattern('(a+)+$'), /may not repeat a group/);
  assert.throws(() => memberPattern('EHP['), /not a valid pattern/);
});

test('an E/M with a minor procedure needs 25 unless it carries 57', () => {
  const two = (mods) => [row({ line: 1, code: '99214', modifiers: mods }), row({ line: 2, code: '11102', charge: 150 })];
  assert.deepEqual(checks(two('')), ['em_modifier_25']);
  assert.deepEqual(checks(two('25')), []);
  assert.deepEqual(checks(two('57')), []);
});

test('the same patient, date and code on two new claims is a possible duplicate; a corrected claim is not', () => {
  assert.deepEqual(checks([row(), row({ claim_id: 'X2' })]), ['duplicate_claim']);
  assert.deepEqual(checks([row(), row({ claim_id: 'X2', frequency: '7', original_ref: 'ICN-1' })]), []);
  assert.ok(checks([row({ line: 1 }), row({ line: 2 })]).includes('duplicate_line'), 'two equal lines on one claim are a duplicate line');
});

test('the filing limit warns inside the warning days and becomes an error once it is passed', () => {
  const near = scrubClaims(groupClaims([row({ date_of_service: '2025-10-15' })]), { config: { ...cfg, warn_days_before_limit: 14 }, asOf: '2026-01-05' }).findings;
  const late = scrubClaims(groupClaims([row({ date_of_service: '2025-09-01' })]), { config: cfg, asOf: '2026-01-05' }).findings;
  assert.deepEqual(near.map((f) => [f.check, f.severity]), [['late_to_file', 'warning']]);
  assert.deepEqual(late.map((f) => [f.check, f.severity]), [['late_to_file', 'error']]);
});

test('prior authorization by code pattern, units above the configured limit, and a zero charge', () => {
  assert.deepEqual(checks([row({ code: '72148', charge: 900 })], { config: cfg }), ['prior_auth']);
  assert.deepEqual(checks([row({ code: '72148', charge: 900, prior_auth: 'PA-1' })], { config: cfg }), []);
  assert.deepEqual(checks([row({ code: '97110', units: 6, charge: 0 })], { config: { max_units: { 97110: 4 } } }), ['units_high', 'zero_charge']);
});

test('a birth date after the service, a missing payer id and an ICD-9 code are each errors', () => {
  const r = scrubClaims(groupClaims([row({ patient_dob: '2026-02-01', payer_id: '', dx_1: '250.00' })]), { asOf: '2026-01-10' });
  assert.deepEqual(r.findings.map((f) => f.check).sort(), ['diagnosis_format', 'patient_dob', 'payer_id']);
  assert.deepEqual([r.ready_to_send, r.charges_held], [0, 100]);
});
