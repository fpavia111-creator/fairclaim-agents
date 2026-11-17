import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRuntime } from 'remedy-core';
import { manifest, refundRule, reviewCredits } from '../src/index.js';

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const sandbox = () => { const root = mkdtempSync(join(tmpdir(), 'tansy-')); cpSync(fixtures, root, { recursive: true }); return root; };
const F = { credits: 'credit-balances-2026-02-15.csv', config: 'credit-config.json', as_of: '2026-02-15' };

test('refund rule: config days win over the Medicare default, memory only shortens', () => {
  assert.deepEqual(refundRule('Medicare Part B'), { days: 60, source: 'medicare_rule' });
  assert.equal(refundRule('X', { config: { payers: [{ name: 'X', refund_days: 90 }] }, facts: [{ id: 'f', value: { payer: 'x', refund_days: 45 } }] }).days, 45);
  assert.equal(refundRule('X', { config: { payers: [{ name: 'X', refund_days: 30 }] }, facts: [{ id: 'f', value: { payer: 'x', refund_days: 45 } }] }).days, 30);
  assert.equal(refundRule('Other'), null);
});

test('identification date drives the deadline, not the credit date', () => {
  const r = reviewCredits([{ account: '1', payer: 'Medicare', payment_source: 'Medicare', amount: -10, credit_date: '2025-01-01', identified_date: '2026-02-01' }], { asOf: '2026-02-15' });
  assert.equal(r.items[0].refund_deadline, '2026-04-02'); assert.equal(r.items[0].action, 'refund');
});

test('positive and negative credit amounts are both credits; zero is skipped', () => {
  const r = reviewCredits([{ account: '1', payment_source: 'Patient', amount: 10 }, { account: '2', payment_source: 'Patient', amount: -10 }, { account: '3', payment_source: 'Patient', amount: 0 }], { asOf: '2026-02-15' });
  assert.equal(r.credits, 2); assert.equal(r.total, 20);
});

test('a refund is move_money: a named person approves even in Auto, and open checks block it', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root, mode: 'auto', autoActions: ['tansy_draft_refund'] });
  const d = await rt.call('tansy_draft_refund', { ...F, account: 'A-1005' });
  assert.equal(d.status, 'executed', d.reason);
  const text = readFileSync(join(root, d.result.draft), 'utf8');
  assert.match(text, /Ezra Lindqvist/); assert.match(text, /apply 25 to the open balance first/);
  assert.equal(d.result.amount, 40);
  const req = await rt.call('tansy_request_refund', { draft: d.result.draft, draft_sha256: d.result.draft_sha256 });
  assert.equal(req.status, 'needs_approval');
  rt.approvals.approve(req.approval_id, 'Lee Billing Manager (fictional)');
  const again = await rt.call('tansy_request_refund', { draft: d.result.draft, draft_sha256: d.result.draft_sha256 });
  assert.equal(again.status, 'error'); assert.match(again.reason, /open markers/);
  const args = { draft: d.result.draft, draft_sha256: d.result.draft_sha256, accept_open_issues: true, note: 'Checked ledger; fictional test' };
  const ask2 = await rt.call('tansy_request_refund', args);
  assert.equal(ask2.status, 'needs_approval', 'changed arguments need a new click');
  rt.approvals.approve(ask2.approval_id, 'Lee Billing Manager (fictional)');
  const ok = await rt.call('tansy_request_refund', args);
  assert.equal(ok.status, 'executed', ok.reason);
  assert.match(readFileSync(join(root, 'remedy-out/tansy/refund-requests.csv'), 'utf8'), /approved - your billing manager acts on it/);
});
