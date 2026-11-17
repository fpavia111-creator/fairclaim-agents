import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRuntime, parseCsv, toCsv } from 'remedy-core';
import { manifest, classify, drawSample, scoreAudit } from '../src/index.js';

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const sandbox = () => { const root = mkdtempSync(join(tmpdir(), 'nettle-')); cpSync(fixtures, root, { recursive: true }); return root; };

test('classify: E/M levels in one family, other codes, modifiers, diagnoses, not supported', () => {
  assert.equal(classify({ billed_code: '99215', audited_code: '99213' }).outcome, 'upcoded');
  assert.equal(classify({ billed_code: '99212', audited_code: '99213' }).outcome, 'downcoded');
  assert.equal(classify({ billed_code: '99203', audited_code: '99213' }).outcome, 'wrong_code');
  assert.equal(classify({ billed_code: '20610', audited_code: 'Not supported' }).outcome, 'not_supported');
  assert.equal(classify({ billed_code: '20610', audited_code: '' }).outcome, 'not_supported');
  assert.equal(classify({ billed_code: '99214', billed_modifiers: '25', audited_code: '99214' }).outcome, 'agree', 'blank audited modifiers mean as billed');
  assert.equal(classify({ billed_code: '99214', billed_modifiers: '25', audited_code: '99214', audited_modifiers: 'none' }).outcome, 'modifier_error');
  assert.match(classify({ billed_code: '11102', audited_code: '11102', audited_modifiers: 'RT' }).detail, /add RT/);
  assert.match(classify({ billed_code: '99213', billed_dx: 'I10', audited_code: '99213', audited_dx: 'E11.9 I10' }).detail, /primary should be E119/);
  assert.equal(classify({ billed_code: '99213', billed_dx: 'E11.9', audited_code: '99213', audited_dx: 'e119' }).outcome, 'agree');
});

test('the sample depends on the seed only, not on the order of the charges', () => {
  const claims = Array.from({ length: 40 }, (_, i) => ({ claim_id: `C${i}`, provider: i % 2 ? 'A' : 'B', diagnoses: [], lines: [{ line: 1, code: '99213', modifiers: [], charge: 100, date_from: '2026-01-10' }] }));
  const a = drawSample(claims, { perProvider: 5, seed: 's1' }).lines.map((l) => l.claim_id);
  const b = drawSample([...claims].reverse(), { perProvider: 5, seed: 's1' }).lines.map((l) => l.claim_id);
  assert.deepEqual([...a].sort(), [...b].sort());
  assert.notDeepEqual(drawSample(claims, { perProvider: 5, seed: 's2' }).lines.map((l) => l.claim_id).sort(), [...a].sort());
  assert.equal(drawSample(claims, { perProvider: 5, seed: 's1', from: '2026-02-01' }).sampled, 0);
});

test('a provider with too few lines is not judged, however low the accuracy', () => {
  const r = scoreAudit([{ provider: 'X', billed_code: '99215', audited_code: '99212' }]);
  assert.equal(r.providers[0].action, 'too_few_lines'); assert.equal(r.providers[0].accuracy, 0);
});

test('a learned focus code adds every matching line to the sample, with the fact id', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  const s = { charges: 'charges-2026-q1.csv', seed: 'q1-2026', per_provider: 2 };
  const before = (await rt.call('nettle_sample', s)).result;
  const l = await rt.call('nettle_learn', { kind: 'focus_code', value: { codes: ['20610'], note: 'Payer asked about injections (fictional)' } });
  const ask = await rt.call('nettle_accept_learning', { id: l.result.fact.id, decision: 'accept' });
  assert.equal(ask.status, 'needs_approval');
  rt.approvals.approve(ask.approval_id, 'Sam Compliance Lead (fictional)');
  assert.equal((await rt.call('nettle_accept_learning', { id: l.result.fact.id, decision: 'accept' })).status, 'executed');
  const after = (await rt.call('nettle_sample', s)).result;
  const f = after.items.filter((i) => i.reason === 'focus');
  assert.equal(f.length, 1); assert.equal(f[0].code, '20610'); assert.equal(f[0].fact_id, l.result.fact.id);
  assert.ok(after.sampled >= before.sampled);
});

test('the worksheet reads straight back into nettle_score once filled in', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  const w = await rt.call('nettle_write_sample', { charges: 'charges-2026-q1.csv', seed: 'q1-2026', per_provider: 3, out_dir: 'out' });
  assert.equal(w.status, 'executed', w.reason);
  const path = join(root, 'out', 'nettle-worksheet.csv');
  const rows = parseCsv(readFileSync(path, 'utf8'));
  assert.ok(rows.length >= 9);
  assert.ok(rows.every((r) => !/^PT-/.test(r.patient_name)) && rows.some((r) => /, /.test(r.patient_name)), 'the file keeps real names for the auditor');
  const header = Object.keys(rows[0]);
  for (const r of rows) { r.audited_code = r.billed_code; r.paid = 'Y'; }
  rows[0].audited_code = 'none';
  writeFileSync(path, toCsv(rows, header));
  const s = await rt.call('nettle_score', { results: 'out/nettle-worksheet.csv' });
  assert.equal(s.status, 'executed', s.reason);
  assert.equal(s.result.lines, rows.length);
  assert.equal(s.result.by_outcome.not_supported, 1);
  assert.equal(s.result.paid_overpayment_lines, 1);
});
