import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRuntime } from 'fairclaim-core';
import { manifest, checkLines, feeIndex } from '../src/index.js';

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const sandbox = () => { const root = mkdtempSync(join(tmpdir(), 'underpayments-')); cpSync(fixtures, root, { recursive: true }); return root; };
const claim = (lines, payer = 'P') => [{ claim_id: 'X', payer, lines: lines.map((l) => ({ modifiers: [], units: 1, adjustments: [], allowed: null, ...l })) }];

test('fee lookup: payer row beats the any-payer row; a modifier row is used only with that modifier; dates bound', () => {
  const f = feeIndex([{ code: '99213', fee: 80 }, { payer: 'P', code: '99213', fee: 90 }, { payer: 'P', code: '93000', modifier: '26', fee: 11 }, { payer: 'P', code: '93000', fee: 30 }, { payer: 'P', code: '99214', fee: 1, effective_to: '2025-12-31' }]);
  assert.equal(f('P', '99213').fee, 90); assert.equal(f('Q', '99213').fee, 80);
  assert.equal(f('P', '93000', ['26']).fee, 11); assert.equal(f('P', '93000').fee, 30);
  assert.equal(f('P', '99214', [], '2026-01-01'), null);
});

test('a fee row for the modifier is not cut again by the modifier percent', () => {
  const r = checkLines(claim([{ code: '93000', modifiers: ['26'], charge: 60, paid: 11, allowed: 11 }]), { config: { payers: [{ name: 'P', method: 'fee_schedule' }], modifier_percent: { 26: 40 } }, fees: [{ payer: 'P', code: '93000', modifier: '26', fee: 11 }] });
  assert.equal(r.lines[0].expected, 11);
});

test('tolerance: within the band is as contracted; overpaid lines are flagged, not hidden', () => {
  const cfg = { payers: [{ name: 'P', method: 'fee_schedule' }], tolerance: 1 };
  const fees = [{ payer: 'P', code: '99213', fee: 100 }];
  assert.equal(checkLines(claim([{ code: '99213', charge: 150, paid: 99.4, allowed: 99.4 }]), { config: cfg, fees }).lines[0].status, 'as_contracted');
  const o = checkLines(claim([{ code: '99213', charge: 150, paid: 120, allowed: 120 }]), { config: cfg, fees });
  assert.equal(o.lines[0].status, 'overpaid'); assert.equal(o.overpaid_amount, 20);
});

test('an accepted contract_fee prices a missing code; a fee-file row still wins', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  const args = { remits: 'era-2026-02-10.835', contract: 'contract.json', fees: 'fees-ehp.csv' };
  assert.equal((await rt.call('underpayments_explain', { ...args, claim_id: 'C7008' })).result.lines[0].status, 'no_fee');
  for (const value of [{ payer: 'Example Health Plan', code: '99395', fee: 145 }, { payer: 'Example Health Plan', code: '99213', fee: 50 }]) {
    const l = await rt.call('underpayments_learn', { kind: 'contract_fee', value });
    const ask = await rt.call('underpayments_accept_learning', { id: l.result.fact.id, decision: 'accept' });
    rt.approvals.approve(ask.approval_id, 'Rae Analyst (fictional)');
    await rt.call('underpayments_accept_learning', { id: l.result.fact.id, decision: 'accept' });
  }
  const after = await rt.call('underpayments_explain', { ...args, claim_id: 'C7008' });
  assert.equal(after.result.lines[0].expected, 145); assert.equal(after.result.lines[0].status, 'overpaid');
  assert.equal((await rt.call('underpayments_explain', { ...args, claim_id: 'C7001' })).result.lines[0].expected, 96, 'fee file wins over memory');
});

test('the reprocessing draft lists the short lines and keeps the patient name in the file only', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root, mode: 'auto', autoActions: ['underpayments_draft_reprocessing_request'] });
  const d = await rt.call('underpayments_draft_reprocessing_request', { remits: 'era-2026-02-10.835', contract: 'contract.json', fees: 'fees-ehp.csv', claim_id: 'C7003' });
  assert.equal(d.status, 'executed', d.reason);
  const text = readFileSync(join(root, d.result.draft), 'utf8');
  assert.match(text, /20610 \| 1 \| 30 \| 40 \| 10 \|/); assert.match(text, /EZRA LINDQVIST/);
  assert.doesNotMatch(JSON.stringify(d), /LINDQVIST/);
  assert.equal(d.result.amount, 10);
});
