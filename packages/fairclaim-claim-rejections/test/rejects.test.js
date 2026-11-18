import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRuntime } from 'fairclaim-core';
import { manifest, claimAt } from '../src/index.js';

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const sandbox = () => { const root = mkdtempSync(join(tmpdir(), 'rejects-')); cpSync(fixtures, root, { recursive: true }); return root; };

test('a segment position maps to the claim whose subscriber loop holds it; the header maps to all', () => {
  const claims = [{ claim_id: 'A', transaction_control: '0001', loop_start: 10, segments: [16, 22] }, { claim_id: 'B', transaction_control: '0001', loop_start: 23, segments: [29, 35] }];
  assert.deepEqual(claimAt(claims, '0001', 12).claims.map((c) => c.claim_id), ['A']);
  assert.deepEqual(claimAt(claims, '0001', 23).claims.map((c) => c.claim_id), ['B']);
  assert.equal(claimAt(claims, '0001', 5).scope, 'billing_provider');
  assert.equal(claimAt(claims, '0002', 5).scope, 'unknown');
});

test('a taught fix appears next to a matching rejection only', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  const l = await rt.call('rejects_learn', { kind: 'rejection_fix', value: { status_code: '562', entity: '82', fix: 'Use the group NPI until the rendering provider is enrolled' } });
  const ask = await rt.call('rejects_accept_learning', { id: l.result.fact.id, decision: 'accept' });
  rt.approvals.approve(ask.approval_id, 'Bo Biller (fictional)');
  await rt.call('rejects_accept_learning', { id: l.result.fact.id, decision: 'accept' });
  const r = await rt.call('rejects_rejections', { acks: ['ack-277ca.x12'] });
  const v3 = r.result.items.find((i) => i.claim_id === 'V1003'); const v7 = r.result.items.find((i) => i.claim_id === 'V1007');
  assert.match(v3.fix, /group NPI/); assert.equal(v3.fact_id, l.result.fact.id);
  assert.doesNotMatch(v7.fix, /group NPI/);
});

test('strict mode: claim numbers are pseudonyms and explain finds them', async () => {
  const rt = new AgentRuntime(manifest, { root: sandbox(), phi: 'strict' });
  const r = await rt.call('rejects_rejections', { acks: ['ack-277ca.x12'] });
  assert.doesNotMatch(JSON.stringify(r), /V100[37]/);
  const id = r.result.items[0].claim_id;
  assert.equal((await rt.call('rejects_explain', { acks: ['ack-277ca.x12'], claim_id: id })).status, 'executed');
});
