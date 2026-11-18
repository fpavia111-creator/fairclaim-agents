import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRuntime } from 'fairclaim-core';
import { manifest, checkAuths, authList } from '../src/index.js';

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const sandbox = () => { const root = mkdtempSync(join(tmpdir(), 'authorizations-')); cpSync(fixtures, root, { recursive: true }); return root; };
const claim = (id, date, units, extra = {}) => ({ claim_id: id, payer_name: 'P', member_id: 'M1', patient_name: 'X', prior_auth: null, lines: [{ code: '97110', units, charge: 40, date_from: date, ...extra }] });

test('units are counted in date order across claims, so the visit that goes over is the one flagged', () => {
  const auths = authList([{ auth_number: 'A1', member_id: 'M1', codes: '97110', units: 4, from: '2026-01-01', to: '2026-12-31' }]);
  const r = checkAuths([claim('late', '2026-02-10', 2), claim('early', '2026-02-01', 3)], auths, { rules: { payers: [{ name: 'P', codes: ['97*'] }] }, asOf: '2026-01-15' });
  assert.deepEqual(r.items.map((i) => [i.claim_id, i.status]).sort(), [['early', 'running_out'], ['late', 'units_exceeded']]);
});

test('a 278 decision updates a logged authorization with the same number', () => {
  const a = authList([{ auth_number: 'A-1', member_id: 'M1', status: 'requested' }], [{ auth_number: 'A1', decision: 'certified', codes: [], trace: 'T' }]);
  assert.equal(a.length, 1); assert.equal(a[0].status, 'approved');
});

test('an accepted payer_auth_rule makes a code need authorization from the next run', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  const f = { services: 'services-2026-02.csv', auths: 'auth-log.csv', rules: 'auth-rules.json', as_of: '2026-02-10' };
  const before = await rt.call('authorizations_check', f);
  assert.equal(before.result.items.find((i) => i.claim_id === 'M10').status, 'not_in_log');
  const l = await rt.call('authorizations_learn', { kind: 'payer_auth_rule', value: { payer: 'Test Medicare Contractor', codes: ['99213'] } });
  const ask = await rt.call('authorizations_accept_learning', { id: l.result.fact.id, decision: 'accept' });
  rt.approvals.approve(ask.approval_id, 'Ana Auth Coordinator (fictional)');
  await rt.call('authorizations_accept_learning', { id: l.result.fact.id, decision: 'accept' });
  const after = await rt.call('authorizations_check', f);
  const m10 = after.result.items.find((i) => i.claim_id === 'M10');
  assert.equal(m10.status, 'missing'); assert.equal(m10.fact_id, l.result.fact.id);
});
