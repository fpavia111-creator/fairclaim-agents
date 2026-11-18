import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRuntime, parseCsvRows } from 'fairclaim-core';
import { manifest, checkMrf, cmsPercentile, countLabel, allowedAmounts, normHead } from '../src/index.js';

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const sandbox = () => { const root = mkdtempSync(join(tmpdir(), 'prices-')); cpSync(fixtures, root, { recursive: true }); return root; };

test('CMS percentile rule: between two observed amounts, take the next highest', () => {
  assert.equal(cmsPercentile([10, 20, 30, 40], 0.5), 30);
  assert.equal(cmsPercentile([10, 20, 30, 40, 50], 0.5), 30);
  assert.equal(cmsPercentile([5], 0.9), 5);
  assert.equal(cmsPercentile([], 0.5), null);
  assert.deepEqual([0, 1, 10, 11, 2025].map(countLabel), ['0', '1 through 10', '1 through 10', '11', '2025']);
});

test('headers compare without case and spaces around pipes', () => {
  assert.equal(normHead(' Standard_Charge | Gross '), 'standard_charge|gross');
});

const head = (attest = 'true') => [
  ['hospital_name', 'last_updated_on', 'version', 'location_name', 'hospital_address', 'license_number|AK', 'type_2_npi', 'To the best of its knowledge and belief, this hospital has included ... payer-specific negotiated charges that cannot be expressed as a dollar amount ...', 'attester_name'],
  ['H', '2026-01-02', '3.0.0', 'Main', '1 Road', '', '2990000012', attest, 'A B'],
  ['description', 'code|1', 'code|1|type', 'modifiers', 'setting', 'drug_unit_of_measurement', 'drug_type_of_measurement', 'standard_charge|gross', 'standard_charge|discounted_cash', 'payer_name', 'plan_name', 'standard_charge|negotiated_dollar', 'standard_charge|negotiated_percentage', 'standard_charge|negotiated_algorithm', 'median_amount', '10th_percentile', '90th_percentile', 'count', 'standard_charge|methodology', 'standard_charge|min', 'standard_charge|max', 'additional_generic_notes'],
];

test('a clean v3 row passes; the attestation must be true; a blank license number is allowed', () => {
  const ok = checkMrf([...head(), ['Visit', '99213', 'CPT', '', 'outpatient', '', '', '180', '126', 'P', 'PPO', '110', '', '', '', '', '', '', 'fee schedule', '92', '140', '']], { asOf: '2026-03-01' });
  assert.equal(ok.errors, 0, JSON.stringify(ok.issues));
  const no = checkMrf([...head('false'), ['Visit', '99213', 'CPT', '', 'outpatient', '', '', '180', '126', '', '', '', '', '', '', '', '', '', '', '', '', '']], { asOf: '2026-03-01' });
  assert.ok(no.issues.some((i) => i.rule === 'attestation' && /must be true/.test(i.message)));
});

test('count 0 needs a note; percentiles must be in order; a modifier row needs no code', () => {
  const r = checkMrf([...head(),
    ['Lab', '85025', 'CPT', '', 'outpatient', '', '', '42', '', 'P', 'HMO', '', '70', '', '', '', '', '0', 'percent of total billed charges', '', '', ''],
    ['Lab', '80053', 'CPT', '', 'outpatient', '', '', '55', '', 'P', 'HMO', '', '70', '', '40', '45', '30', '12', 'percent of total billed charges', '', '', ''],
    ['Bilateral procedure', '', '', '50', 'both', '', '', '', '', 'P', 'HMO', '', '150', '', '', '', '', '0', 'other', '', '', 'Paid at 150% of the primary procedure'],
  ], { asOf: '2026-03-01' });
  assert.deepEqual(r.issues.filter((i) => i.severity === 'error').map((i) => `${i.row}:${i.rule}`), ['4:rule_9', '5:percentiles']);
});

test('a short header block is reported, not thrown', () => {
  assert.equal(checkMrf(parseCsvRows('a,b\n1,2\n')).issues[0].rule, 'layout');
});

test('allowed amounts fall back to charge minus contractual adjustments when the 835 sends no AMT*B6', () => {
  const claims = [1, 2, 3].map((i) => ({ payer: 'P', status: '1', paid: 50, lines: [{ code: '99213', charge: 100, allowed: null, date_from: '2025-06-01', adjustments: [{ group: 'CO', reason: '45', amount: 10 * i }, { group: 'PR', reason: '2', amount: 20 }] }] }));
  const r = allowedAmounts(claims, { from: '2025-04-01', to: '2026-03-31' });
  assert.deepEqual([r.rows[0]['10th_percentile'], r.rows[0].median_amount, r.rows[0]['90th_percentile']], [80, 80, 90]);
});

test('a learned required code is checked, with the fact id on the issue', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  const f = { file: 'standard-charges-v3.csv', as_of: '2026-03-01', rule: 'required_code' };
  assert.equal((await rt.call('prices_check_file', f)).result.items.length, 0);
  const l = await rt.call('prices_learn', { kind: 'required_code', value: { code: '45378', note: 'Colonoscopy: on the CMS shoppable list (fictional note)' } });
  const ask = await rt.call('prices_accept_learning', { id: l.result.fact.id, decision: 'accept' });
  rt.approvals.approve(ask.approval_id, 'Robin Revenue Integrity (fictional)');
  assert.equal((await rt.call('prices_accept_learning', { id: l.result.fact.id, decision: 'accept' })).status, 'executed');
  const items = (await rt.call('prices_check_file', f)).result.items;
  assert.equal(items.length, 1); assert.equal(items[0].fact_id, l.result.fact.id); assert.match(items[0].message, /45378/);
});
