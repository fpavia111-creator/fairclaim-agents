import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRuntime } from 'fairclaim-core';
import { manifest, checkModifiers } from '../src/index.js';

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const sandbox = () => { const root = mkdtempSync(join(tmpdir(), 'modifiers-')); cpSync(fixtures, root, { recursive: true }); return root; };
const claim = (lines, payer = 'X Plan') => ({ claim_id: 'c1', payer_name: payer, lines: lines.map(([code, mods, extra = {}], i) => ({ line: i + 1, code, modifiers: mods, date_from: '2026-01-01', units: 1, ...extra })) });
const checks = (r) => r.issues.map((i) => i.check);

test('five modifiers is too many; order of payment modifiers', () => {
  assert.ok(checks(checkModifiers([claim([['97110', ['GP', 'KX', 'XE', 'CQ', '59']]])])).includes('too_many'));
  assert.deepEqual(checks(checkModifiers([claim([['73030', ['26', 'RT']]])])), []);
});

test('57 is fine on an E/M with a procedure; 76 needs a first service', () => {
  assert.deepEqual(checks(checkModifiers([claim([['99223', ['57']], ['27447', []]])])), []);
  assert.deepEqual(checks(checkModifiers([claim([['71046', []], ['71046', ['76']]])])), []);
  assert.deepEqual(checks(checkModifiers([claim([['71046', ['76']]])])), ['repeat_without_first']);
});

test('E/M with only labs or add-on-free codes does not need 25', () => {
  assert.deepEqual(checks(checkModifiers([claim([['99213', []], ['85025', []], ['J1030', []]])])), []);
});

test('a digit modifier counts as laterality', () => {
  assert.deepEqual(checks(checkModifiers([claim([['26600', ['F6']]])], { config: { laterality_codes: ['26*'] } })), []);
});

test('memory adds a payer rule; the issue carries the fact id; built-in checks stay', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  const l = await rt.call('modifiers_learn', { kind: 'payer_modifier_rule', value: { payer: 'Sample Mutual Insurance', action: 'needs_one_of', modifiers: ['RT', 'LT', '50'], codes: ['20610'], note: 'fictional rule from a denial' } });
  const ask = await rt.call('modifiers_accept_learning', { id: l.result.fact.id, decision: 'accept' });
  rt.approvals.approve(ask.approval_id, 'Lee Coding Lead (fictional)');
  assert.equal((await rt.call('modifiers_accept_learning', { id: l.result.fact.id, decision: 'accept' })).status, 'executed');
  const r = await rt.call('modifiers_check', { claims: 'batch-2026-02-06.837', check: 'payer_needs_one_of' });
  assert.deepEqual(r.result.items.map((i) => i.claim_id), ['D1002']);
  assert.equal(r.result.items[0].fact_id, l.result.fact.id);
  const all = await rt.call('modifiers_check', { claims: 'batch-2026-02-06.837' });
  assert.ok(all.result.by_check.em_needs_25 === 1 && all.result.by_check.wrong_code_25 === 1);
});

test('the report keeps real names', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  const r = await rt.call('modifiers_write_report', { claims: 'batch-2026-02-06.837', config: 'modifier-config.json' });
  assert.equal(r.status, 'executed', r.reason);
  assert.match(readFileSync(join(root, 'remedy-out/modifiers/modifiers.csv'), 'utf8'), /JUNIPER OKAFOR|Juniper Okafor/i);
});
