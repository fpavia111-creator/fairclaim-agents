// Domain checks for the price transparency file, the chargemaster and allowed amounts (ver 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkMrf, compareChargemaster, allowedAmounts, defaultPeriod } from '../src/logic.js';

const H1 = ['hospital_name', 'last_updated_on', 'version', 'location_name', 'hospital_address', 'license_number|AK', 'type_2_npi', 'To the best of its knowledge and belief, this hospital has included ... payer-specific negotiated charges that cannot be expressed as a dollar amount ...', 'attester_name'];
const H3 = ['description', 'code|1', 'code|1|type', 'modifiers', 'setting', 'drug_unit_of_measurement', 'drug_type_of_measurement', 'standard_charge|gross', 'standard_charge|discounted_cash', 'payer_name', 'plan_name', 'standard_charge|negotiated_dollar', 'standard_charge|negotiated_percentage', 'standard_charge|negotiated_algorithm', 'median_amount', '10th_percentile', '90th_percentile', 'count', 'standard_charge|methodology', 'standard_charge|min', 'standard_charge|max', 'additional_generic_notes'];
const file = (rows, { updated = '2026-01-02', version = '3.0.0', npi = '2990000012' } = {}) => [H1, ['H', updated, version, 'Main', '1 Road', '', npi, 'true', 'A B'], H3, ...rows];
const row = (o = {}) => H3.map((h) => o[h] ?? { description: 'Visit', 'code|1': '99213', 'code|1|type': 'CPT', setting: 'outpatient', 'standard_charge|gross': '180' }[h] ?? '');
const errs = (r) => r.issues.filter((i) => i.severity === 'error').map((i) => i.rule);

test('a file older than 12 months is stale; a v2 file is told to move to v3.0', () => {
  assert.ok(errs(checkMrf(file([row()], { updated: '2024-12-01' }), { asOf: '2026-03-01' })).includes('stale'));
  assert.deepEqual(errs(checkMrf(file([row()]), { asOf: '2026-03-01' })), []);
  const v2 = checkMrf(file([row()], { version: '2.2.0' }), { asOf: '2026-03-01' });
  assert.ok(v2.issues.some((i) => i.rule === 'version' && i.severity === 'warning' && /v3\.0/.test(i.message)));
});

test('a negotiated charge needs payer, plan, methodology and the min and max; amounts must be plain numbers', () => {
  const r = checkMrf(file([row({ payer_name: 'Example Health Plan', 'standard_charge|negotiated_dollar': '$110.00' })]), { asOf: '2026-03-01' });
  assert.deepEqual([...new Set(errs(r))].sort(), ['number_format', 'rule_1', 'rule_6']);
  assert.ok(r.issues.some((i) => i.column === 'plan_name'));
});

test('an NDC row needs its drug unit and type; the type must be a CMS value', () => {
  const r = checkMrf(file([row({ 'code|1': '00002-1433-80', 'code|1|type': 'NDC' }), row({ description: 'Drug', 'code|1': 'J1100', 'code|1|type': 'HCPCS', drug_unit_of_measurement: '1', drug_type_of_measurement: 'XX' })]), { asOf: '2026-03-01' });
  assert.deepEqual(errs(r), ['rule_10', 'drug_type']);
});

test('a bad type 2 NPI, an unknown code type and a cash price over gross are each caught', () => {
  const r = checkMrf(file([row({ 'code|1|type': 'CPT4' }), row({ description: 'X-ray', 'code|1': '71046', 'standard_charge|discounted_cash': '200' })], { npi: '2990000013' }), { asOf: '2026-03-01' });
  assert.deepEqual(errs(r), ['type_2_npi', 'code_type']);
  assert.ok(r.issues.some((i) => i.rule === 'cash_over_gross'));
});

test('the chargemaster comparison finds missing items, price differences and items only in the file', () => {
  const codes = checkMrf(file([row(), row({ description: 'X-ray', 'code|1': '71046', 'standard_charge|gross': '95' })]), { asOf: '2026-03-01' }).codes;
  const out = compareChargemaster(codes, [{ code: '99213', price: '180.00' }, { code: '71046', price: '99' }, { code: '36415', price: '12' }]);
  assert.deepEqual(out.map((o) => `${o.code}:${o.status}`), ['71046:gross_differs', '36415:missing_from_file']);
  assert.deepEqual(compareChargemaster(codes, [{ code: '99213', price: '180' }]).map((o) => o.status), ['not_in_chargemaster']);
});

test('allowed amounts skip reversals and zero lines, and name CPT category II, III and PLA codes as CPT', () => {
  const line = (code, allowed) => ({ code, charge: 100, allowed, date_from: '2025-06-01', adjustments: [] });
  const claims = [{ payer: 'P', status: '1', paid: 10, lines: [line('0042T', 50), line('0001U', 40), line('J1100', 5), line('99213', 0)] }, { payer: 'P', status: '22', paid: -10, lines: [line('99213', 70)] }];
  const r = allowedAmounts(claims, { from: '2025-04-01', to: '2026-03-31' });
  assert.deepEqual(r.rows.map((x) => `${x.code}:${x.code_type}`), ['0001U:CPT', '0042T:CPT', 'J1100:HCPCS']);
  assert.deepEqual(r.skipped, { reversal: 1, zero: 1, outside: 0 });
});

test('the default period is the 12 months before posting; a short period gets a note', () => {
  assert.deepEqual(defaultPeriod('2026-04-01'), { from: '2025-04-01', to: '2026-03-31' });
  assert.match(allowedAmounts([], { from: '2025-10-01', to: '2026-03-31' }).notes[0], /between 12 and 15 months/);
  assert.equal(allowedAmounts([], defaultPeriod('2026-04-01')).notes.length, 0);
});
