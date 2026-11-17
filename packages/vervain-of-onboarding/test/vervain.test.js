import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRuntime } from 'remedy-core';
import { manifest, checkReadiness, statusOf, taxonomyValid } from '../src/index.js';

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const sandbox = () => { const root = mkdtempSync(join(tmpdir(), 'vervain-')); cpSync(fixtures, root, { recursive: true }); return root; };
const setup = { practice: { name: 'P', billing_npi: '2990000012', tax_id: '99-0000001', address: { street: '1 Main St', city: 'X', state: 'AK', zip: '99501-1234' } }, go_live: '2026-03-02' };
const roster = [{ provider: 'Dr A', npi: '1990000014', taxonomy: '207Q00000X', license_state: 'AK' }];
const enr = (o = {}) => [{ payer: 'Plan', payer_id: '1', edi: 'Approved', era: 'Approved', eft: 'Approved', ...o.group }, { payer: 'Plan', provider: 'Dr A', credentialing: 'Approved', ...o.prov }];

test('a clean setup is ready, with only the NPPES note', () => {
  const o = checkReadiness({ setup, roster, enrollments: enr(), asOf: '2026-02-15' });
  assert.equal(o.ready, true); assert.equal(o.errors, 0); assert.equal(o.warnings, 0); assert.equal(o.items.length, 1);
});

test('status words are read loosely; unknown ones are flagged', () => {
  assert.equal(statusOf('Enrolled'), 'done'); assert.equal(statusOf('in review'), 'pending'); assert.equal(statusOf('Rejected'), 'denied'); assert.equal(statusOf('maybe'), 'unknown'); assert.equal(statusOf(''), 'missing');
  const o = checkReadiness({ setup, roster, enrollments: enr({ group: { era: 'maybe' } }), asOf: '2026-02-15' });
  assert.match(o.items.find((i) => i.severity === 'warning').message, /status "maybe" is not one Vervain knows/);
});

test('group credentialing covers providers only for listed group contracts', () => {
  const e = [{ payer: 'Plan', payer_id: '1', edi: 'Approved', era: 'Approved', eft: 'Approved', credentialing: 'Approved' }];
  assert.equal(checkReadiness({ setup, roster, enrollments: e }).ready, false);
  assert.equal(checkReadiness({ setup: { ...setup, group_contracts: ['plan'] }, roster, enrollments: e }).ready, true);
});

test('a rendering NPI equal to the billing NPI, and duplicate NPIs, are errors; taxonomy shape', () => {
  const o = checkReadiness({ setup, roster: [...roster, { provider: 'Dr B', npi: '2990000012', taxonomy: '207Q00000X', license_state: 'AK' }, { provider: 'Dr C', npi: '1990000014', taxonomy: '207Q00000X', license_state: 'AK' }], enrollments: [] });
  const msgs = o.items.filter((i) => i.area === 'providers').map((i) => i.message).join(' ');
  assert.match(msgs, /Uses the billing \(group\) NPI/); assert.match(msgs, /also on Dr A/);
  assert.equal(taxonomyValid('207q00000x'), true); assert.equal(taxonomyValid('207Q00000'), false);
});

test('a learned lead time can only lengthen the default, and its fact id shows', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  const f = { setup: 'onboarding-setup.json', roster: 'provider-roster.csv', enrollments: 'payer-enrollments.csv', as_of: '2026-02-15' };
  const accept = async (value) => { const l = await rt.call('vervain_learn', { kind: 'payer_lead_days', value }); const ask = await rt.call('vervain_accept_learning', { id: l.result.fact.id, decision: 'accept' }); rt.approvals.approve(ask.approval_id, 'Sam Onboarding Lead (fictional)'); assert.equal((await rt.call('vervain_accept_learning', { id: l.result.fact.id, decision: 'accept' })).status, 'executed'); return l.result.fact.id; };
  const before = (await rt.call('vervain_check', f)).result;
  const era = (r) => r.items.find((i) => i.payer === 'Sample Mutual Insurance' && i.enrollment === 'era');
  assert.match(era(before).message, /lead time for this payer is 30 days/);
  await accept({ payer: 'Sample Mutual Insurance', days: 10, note: 'shorter than default (fictional)' });
  assert.match(era((await rt.call('vervain_check', f)).result).message, /lead time for this payer is 30 days/);
  const id = await accept({ payer: 'Test Medicare Contractor', days: 60 });
  const id2 = await accept({ payer: 'Sample Mutual Insurance', days: 45, note: 'ERA took 6 weeks last time (fictional)' });
  const after = (await rt.call('vervain_check', f)).result;
  assert.ok(id);
  assert.match(era(after).message, /45 days \(ERA took 6 weeks last time \(fictional\)\)/);
  assert.equal(era(after).fact_id, id2);
});
