import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRuntime } from 'remedy-core';
import { manifest, matchPayments, depositTraces, explainPlb } from '../src/index.js';

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const sandbox = () => { const root = mkdtempSync(join(tmpdir(), 'fennel-')); cpSync(fixtures, root, { recursive: true }); return root; };

test('trace numbers come from a trace column or from TRN*1* in the ACH description', () => {
  assert.deepEqual(depositTraces({ description: 'HCCLAIMPMT TRN*1*EFT-77*1999\\', trace_number: '' }), ['EFT77']);
  assert.deepEqual(depositTraces({ description: 'x', trace_number: 'abc 1' }), ['ABC1']);
});

test('two deposits of the same amount in the window: matched, but flagged for review; outside the window: no match', () => {
  const pays = [{ trace_number: 'T1', payer: 'P', date: '2026-01-10', amount: 100 }];
  const r = matchPayments(pays, [{ date: '2026-01-11', amount: 100 }, { date: '2026-01-12', amount: 100 }]);
  assert.equal(r.rows[0].status, 'matched_review');
  assert.equal(r.rows[0].deposit_date, '2026-01-11');
  assert.equal(matchPayments(pays, [{ date: '2026-01-20', amount: 100 }], { windowDays: 5 }).rows[0].status, 'no_deposit');
});

test('PLB sign: a positive amount reduces the payment, a negative one adds', () => {
  const p = explainPlb([{ reason: 'WO', amount: 40 }, { reason: 'L6', amount: -2.1 }, { reason: 'ZZ', amount: 1 }]);
  assert.equal(p.reduced, 41); assert.equal(p.added, 2.1);
  assert.match(p.items[2].meaning, /Not in/);
});

test('a taught bank name labels the deposit; it never turns it into a match', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  const args = { remits: 'era-2026-02.835', deposits: 'bank-2026-02.csv' };
  assert.equal((await rt.call('fennel_match', args)).result.unmatched_deposits[0].likely_payer, null);
  const l = await rt.call('fennel_learn', { kind: 'payer_deposit_name', value: { payer: 'Example Health Plan', bank_text: 'EXMPL HLTH' } });
  const ask = await rt.call('fennel_accept_learning', { id: l.result.fact.id, decision: 'accept' });
  rt.approvals.approve(ask.approval_id, 'Pat Poster (fictional)');
  await rt.call('fennel_accept_learning', { id: l.result.fact.id, decision: 'accept' });
  const after = await rt.call('fennel_match', args);
  assert.equal(after.result.unmatched_deposits[0].likely_payer, 'Example Health Plan');
  assert.equal(after.result.unmatched_deposits[0].fact_id, l.result.fact.id);
  assert.equal(after.result.matched, 2, 'same matches as before');
});

test('inquiry: drafted in Auto only when allowed, approval needs the unchanged draft', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root, mode: 'auto', autoActions: ['fennel_draft_inquiry'] });
  const args = { remits: 'era-2026-02.835', deposits: 'bank-2026-02.csv' };
  const d = await rt.call('fennel_draft_inquiry', { ...args, item: 'row 4' });
  assert.equal(d.status, 'executed', d.reason);
  const text = readFileSync(join(root, d.result.draft), 'utf8');
  assert.match(text, /DRAFT/); assert.match(text, /512\.34/); assert.match(text, /TO CONFIRM/);
  const bad = await rt.call('fennel_request_send', { draft: d.result.draft, draft_sha256: '0'.repeat(64) });
  assert.equal(bad.status, 'needs_approval');
  await assert.rejects(async () => { const r = await rt.call('fennel_draft_inquiry', { ...args, item: 'EFT20260205A' }); if (r.status === 'error') throw new Error(r.reason); }, /matched/);
});
