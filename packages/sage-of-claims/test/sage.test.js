import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRuntime, groupClaims } from 'remedy-core';
import { manifest, scrubClaims } from '../src/index.js';

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const sandbox = () => { const root = mkdtempSync(join(tmpdir(), 'sage-')); cpSync(fixtures, root, { recursive: true }); return root; };
const claim = (over = {}, line = {}) => groupClaims([{ claim_id: 'X1', patient_name: 'Test Person', patient_dob: '1980-01-01', member_id: 'M1', payer: 'P', payer_id: '1', billing_npi: '2990000012', pos: '11', date_of_service: '2026-01-05', code: '99213', units: 1, charge: 100, dx_1: 'J06.9', dx_pointer: '1', ...over, ...line }]);

test('a clean claim has no findings; each planted fault is caught once', () => {
  assert.deepEqual(scrubClaims(claim(), { asOf: '2026-01-10' }).findings, []);
  const one = (over) => scrubClaims(claim(over), { asOf: '2026-01-10' }).findings.map((f) => f.check);
  assert.deepEqual(one({ billing_npi: '2990000013' }), ['billing_npi']);
  assert.deepEqual(one({ dx_1: '4019' }), ['diagnosis_format']);
  assert.deepEqual(one({ dx_pointer: 'B' }), ['pointer_range']);
  assert.deepEqual(one({ modifiers: 'LT RT' }), ['modifier_conflict']);
  assert.deepEqual(one({ frequency: '8' }), ['frequency_ref']);
  assert.deepEqual(one({ frequency: '8', original_ref: 'ICN1' }), []);
  assert.deepEqual(one({ date_of_service: '2026-02-01' }), ['future_service']);
});

test('payer rules: prior-auth wildcards and filing limit turn into an error past the limit', () => {
  const config = { payers: [{ name: 'P', prior_auth_codes: ['97*'], timely_days: 30 }] };
  const r = scrubClaims(claim({ code: '97110', date_of_service: '2025-11-01' }), { config, asOf: '2026-01-10' });
  assert.deepEqual(r.findings.map((f) => [f.check, f.severity]), [['prior_auth', 'error'], ['late_to_file', 'error']]);
  assert.equal(scrubClaims(claim({ code: '97110', prior_auth: 'PA1', date_of_service: '2026-01-02' }), { config, asOf: '2026-01-10' }).findings.length, 0);
});

test('an accepted payer_required_field fact adds an error from the next run; memory off removes it', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  const args = { claims: 'batch-2026-01-20.837', as_of: '2026-01-20', claim_id: 'C4010' };
  const before = await rt.call('sage_explain', args);
  assert.equal(before.result.findings.length, 0);
  const l = await rt.call('sage_learn', { kind: 'payer_required_field', value: { payer: 'Demo Medicaid Plan', field: 'referring_npi', codes: ['97*'] } });
  const ask = await rt.call('sage_accept_learning', { id: l.result.fact.id, decision: 'accept' });
  rt.approvals.approve(ask.approval_id, 'Dana Billing Lead (fictional)');
  await rt.call('sage_accept_learning', { id: l.result.fact.id, decision: 'accept' });
  const after = await rt.call('sage_explain', args);
  assert.deepEqual(after.result.findings.map((f) => [f.check, f.field, f.fact_id]), [['payer_required', 'referring_npi', l.result.fact.id]]);
  const off = new AgentRuntime(manifest, { root, memory: false });
  assert.equal((await off.call('sage_explain', args)).result.findings.length, 0);
});

test('the work list keeps names for staff; result and audit do not', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  const r = await rt.call('sage_write_report', { claims: 'batch-2026-01-20.837', config: 'scrub-config.json', as_of: '2026-01-20' });
  assert.equal(r.status, 'executed', r.reason);
  const csv = readFileSync(join(root, 'remedy-out/sage/sage-scrub.csv'), 'utf8');
  assert.match(csv, /THIBODEAUX/);
  assert.equal(csv.trim().split('\n').length, 20);
  assert.doesNotMatch(JSON.stringify(r) + readFileSync(join(root, '.remedy/audit.jsonl'), 'utf8'), /THIBODEAUX|1949-01-30/i);
});

test('strict mode hides claim numbers and still finds a claim by its pseudonym', async () => {
  const rt = new AgentRuntime(manifest, { root: sandbox(), phi: 'strict' });
  const s = await rt.call('sage_scrub', { claims: 'batch-2026-01-20.837', as_of: '2026-01-20' });
  assert.doesNotMatch(JSON.stringify(s), /C400\d/);
  const id = s.result.items[0].claim_id;
  assert.equal((await rt.call('sage_explain', { claims: 'batch-2026-01-20.837', as_of: '2026-01-20', claim_id: id })).status, 'executed');
});
