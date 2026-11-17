import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRuntime } from 'remedy-core';
import { manifest, findCitations, trackAppeals } from '../src/index.js';

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const sandbox = () => { const root = mkdtempSync(join(tmpdir(), 'rosemary-')); cpSync(fixtures, root, { recursive: true }); return root; };

test('a code in the line counts more than a category word; whole-code match only', () => {
  const c = findCitations([{ file: 'p.md', text: 'Separately payable when distinct.\nCode 206100 is something else.\n20610 is separately payable.' }], { codes: ['20610'], category: 'bundling' });
  assert.deepEqual(c.map((x) => x.line), [3, 1]);
});

test('tracking: a lost last-level appeal is exhausted; a lost earlier one goes to the next level', () => {
  const t = trackAppeals([{ claim_id: 'A', level: 1, filed: '2026-01-01', status: 'denied' }, { claim_id: 'B', level: 2, filed: '2026-01-01', status: 'upheld' }], { config: { max_levels: 2 }, asOf: '2026-01-10' });
  assert.deepEqual(t.items.map((i) => [i.claim_id, i.status]), [['A', 'next_level'], ['B', 'exhausted']]);
});

test('the draft quotes policy by file and line, keeps markers, and the address from memory stays marked CHECK', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root, mode: 'auto', autoActions: ['rosemary_draft_appeal'] });
  const l = await rt.call('rosemary_learn', { kind: 'payer_appeal_address', value: { payer: 'Sample Mutual Insurance', text: 'Appeals Unit, PO Box 0000, Exampleton AK 99501' } });
  const ask = await rt.call('rosemary_accept_learning', { id: l.result.fact.id, decision: 'accept' });
  rt.approvals.approve(ask.approval_id, 'Lee Billing Lead (fictional)');
  await rt.call('rosemary_accept_learning', { id: l.result.fact.id, decision: 'accept' });
  const d = await rt.call('rosemary_draft_appeal', { remits: 'era-2026-02-12.835', config: 'appeal-config.json', claim_id: 'R1002', policies: ['policies/smi-joint-injections.md'] });
  assert.equal(d.status, 'executed', d.reason);
  const text = readFileSync(join(root, d.result.draft), 'utf8');
  assert.match(text, /policies\/smi-joint-injections\.md, line 7/);
  assert.match(text, /PO Box 0000.*\[CHECK/);
  assert.match(text, /\[MISSING: two or three sentences/);
  assert.doesNotMatch(text, /every appeal is approved/);
  assert.equal(d.result.fact_id, l.result.fact.id);
  const req = await rt.call('rosemary_request_send', { draft: d.result.draft, draft_sha256: d.result.draft_sha256 });
  assert.equal(req.status, 'needs_approval');
  rt.approvals.approve(req.approval_id, 'Lee Billing Lead (fictional)');
  const again = await rt.call('rosemary_request_send', { draft: d.result.draft, draft_sha256: d.result.draft_sha256 });
  assert.equal(again.status, 'error'); assert.match(again.reason, /open markers/);
});
