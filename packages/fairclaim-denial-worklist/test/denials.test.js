import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRuntime, groupRemits } from 'fairclaim-core';
import { manifest, sortDenials, appealDays } from '../src/index.js';

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const sandbox = () => { const root = mkdtempSync(join(tmpdir(), 'denials-')); cpSync(fixtures, root, { recursive: true }); return root; };

test('contractual write-downs and cost sharing are not denials; a remark refines a generic reason', () => {
  const { claims } = groupRemits([
    { claim_id: 'X1', payer: 'P', code: '99213', billed: 100, paid: 60, adjustments: 'CO-45 20; PR-2 20' },
    { claim_id: 'X2', payer: 'P', code: '99213', billed: 100, paid: 0, adjustment_group: 'CO', adjustment_reason: '16', adjustment_amount: 100, remarks: 'M15' },
  ]);
  const r = sortDenials(claims, { asOf: '2026-01-01' });
  assert.equal(r.denials, 1);
  assert.equal(r.items[0].category, 'bundling');
  assert.equal(r.items[0].refined_by_remark, 'M15');
});

test('appeal days: payer entry wins, then the default, else none', () => {
  const cfg = { appeal_days: 90, payers: [{ name: 'Sample Mutual Insurance', appeal_days: 60 }] };
  assert.equal(appealDays(cfg, 'SAMPLE MUTUAL INSURANCE'), 60);
  assert.equal(appealDays(cfg, 'Other'), 90);
  assert.equal(appealDays({}, 'Other'), null);
});

test('an accepted payer mapping changes the category from the next run; the audit names the fact', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  const args = { remits: 'era-2026-01.835', as_of: '2026-02-01' };
  const before = await rt.call('denials_explain', { ...args, claim_id: 'C2006' });
  assert.equal(before.result.denials[0].category, 'unknown');
  const l = await rt.call('denials_learn', { kind: 'payer_code_category', value: { payer: 'Sample Mutual Insurance', code: '989', group: 'CO', category: 'authorization' } });
  const ask = await rt.call('denials_accept_learning', { id: l.result.fact.id, decision: 'accept' });
  assert.equal(ask.status, 'needs_approval');
  rt.approvals.approve(ask.approval_id, 'Dana Billing Lead (fictional)');
  assert.equal((await rt.call('denials_accept_learning', { id: l.result.fact.id, decision: 'accept' })).status, 'executed');
  const after = await rt.call('denials_explain', { ...args, claim_id: 'C2006' });
  assert.equal(after.result.denials[0].category, 'authorization');
  assert.deepEqual(after.memory_applied.map((f) => f.id), [l.result.fact.id]);
  const off = new AgentRuntime(manifest, { root, memory: false });
  assert.equal((await off.call('denials_explain', { ...args, claim_id: 'C2006' })).result.denials[0].category, 'unknown');
});

test('the worklist file keeps real names for staff; the result and the audit log do not', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  const r = await rt.call('denials_write_report', { remits: 'era-2026-01.835', as_of: '2026-02-01' });
  assert.equal(r.status, 'executed', r.reason);
  const csv = readFileSync(join(root, 'remedy-out/denials/denials.csv'), 'utf8');
  assert.match(csv, /JUNIPER OKAFOR/);
  assert.doesNotMatch(JSON.stringify(r), /OKAFOR/i);
  assert.doesNotMatch(readFileSync(join(root, '.remedy/audit.jsonl'), 'utf8'), /OKAFOR/i);
});

test('strict mode: claim numbers become pseudonyms, and the pseudonym still finds the claim', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root, phi: 'strict' });
  const s = await rt.call('denials_sort', { remits: 'era-2026-01.835' });
  const id = s.result.items.find((i) => i.reason === '197').claim_id;
  assert.match(id, /^CLM-[0-9a-f]{8}$/);
  assert.doesNotMatch(JSON.stringify(s), /C2002/);
  const e = await rt.call('denials_explain', { remits: 'era-2026-01.835', claim_id: id });
  assert.equal(e.status, 'executed', e.reason);
  assert.equal(e.result.denials[0].reason, '197');
  assert.match(e.result.denials[0].date_of_service, /^2026-01$/, 'service dates cut to the month');
});
