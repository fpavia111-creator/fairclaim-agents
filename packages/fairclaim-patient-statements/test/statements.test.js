import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRuntime } from 'fairclaim-core';
import { manifest, statementCycle } from '../src/index.js';

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const sandbox = () => { const root = mkdtempSync(join(tmpdir(), 'statements-')); cpSync(fixtures, root, { recursive: true }); return root; };
const F = { accounts: 'patient-balances-2026-02-20.csv', config: 'statement-config.json', as_of: '2026-02-20' };

test('a legal hold beats every other state, even a final notice due', () => {
  const r = statementCycle([{ account: '1', balance: 100, statements_sent: 2, last_statement: '2026-01-01', flags: 'Chapter 7 bankruptcy filed' }], { asOf: '2026-02-20' });
  assert.equal(r.items[0].hold, 'legal_hold');
});

test('credits and zero balances are not statement accounts', () => {
  assert.equal(statementCycle([{ account: '1', balance: -10 }, { account: '2', balance: 0 }], { asOf: '2026-02-20' }).accounts, 0);
});

test('a learned hold word holds the auto accident (PIP) account; the fact id is on the row', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  let r = await rt.call('statements_cycle', { ...F, action: 'first_statement' });
  assert.equal(r.result.items.length, 2);
  const l = await rt.call('statements_learn', { kind: 'hold_word', value: { word: 'PIP claim', hold: 'insurance_pending', note: 'bill the auto carrier first (fictional)' } });
  const ask = await rt.call('statements_accept_learning', { id: l.result.fact.id, decision: 'accept' });
  rt.approvals.approve(ask.approval_id, 'Lee Billing Lead (fictional)');
  assert.equal((await rt.call('statements_accept_learning', { id: l.result.fact.id, decision: 'accept' })).status, 'executed');
  r = await rt.call('statements_cycle', { ...F, action: 'first_statement' });
  assert.equal(r.result.items.length, 1);
  const held = (await rt.call('statements_cycle', { ...F, action: 'hold' })).result.items.find((i) => i.fact_id === l.result.fact.id);
  assert.ok(held); assert.match(held.message, /bill the auto carrier first/);
});

test('the final notice draft is kind, names the balance and leaves the due date open', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root, mode: 'auto', autoActions: ['statements_draft_statement'] });
  const d = await rt.call('statements_draft_statement', { ...F, account: 'A-1003' });
  assert.equal(d.status, 'executed', d.reason);
  const text = readFileSync(join(root, d.result.draft), 'utf8');
  assert.match(text, /\*\*Final notice\*\*/); assert.match(text, /You owe \*\*240\*\*/); assert.match(text, /payment plan/);
  assert.match(text, /\[TO CONFIRM: due date\]/); assert.match(text, /Rowan Castellano/);
});
