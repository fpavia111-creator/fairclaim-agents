import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRuntime } from 'fairclaim-core';
import { manifest, checkEdits, ptpIndex, mueIndex, bypassUsed } from '../src/index.js';

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const sandbox = () => { const root = mkdtempSync(join(tmpdir(), 'edits-')); cpSync(fixtures, root, { recursive: true }); return root; };
const claim = (lines, extra = {}) => ({ claim_id: 'X', member_id: 'M', payer_name: 'P', lines: lines.map((l, i) => ({ line: i + 1, modifiers: [], units: 1, charge: 10, date_from: '2026-01-05', ...l })), ...extra });

test('bypass: distinct modifiers on either line; anatomic only when the sides differ', () => {
  assert.deepEqual(bypassUsed([], ['XS']), ['XS']);
  assert.deepEqual(bypassUsed(['LT'], ['LT']), []);
  assert.deepEqual(bypassUsed(['LT'], ['RT']), ['LT', 'RT']);
  assert.deepEqual(bypassUsed(['GT'], ['95']), []);
});

test('edit dates: the edit applies from its effective date up to (not including) its deletion date', () => {
  const ptp = ptpIndex([{ column_1: 'A0001', column_2: 'B0001', effective: '20260110', deletion: '20260201', modifier_indicator: '0' }]);
  const at = (d) => checkEdits([claim([{ code: 'A0001', date_from: d }, { code: 'B0001', date_from: d }])], { ptp }).findings.length;
  assert.equal(at('2026-01-09'), 0); assert.equal(at('2026-01-10'), 1); assert.equal(at('2026-01-31'), 1); assert.equal(at('2026-02-01'), 0);
});

test('MUE: MAI 1 per line, MAI 2 and 3 per patient and day; indicator read from the leading digit', () => {
  const mue = mueIndex([{ code: 'A0001', mue: 2, mai: '1 Line Edit' }, { code: 'B0001', mue: 2, mai: '3 Date of Service Edit: Clinical' }]);
  const r = checkEdits([claim([{ code: 'A0001', units: 2 }, { code: 'A0001', units: 2 }, { code: 'B0001', units: 1 }]), claim([{ code: 'B0001', units: 2 }], { claim_id: 'Y' })], { mue });
  assert.deepEqual(r.findings.map((f) => [f.kind, f.severity]), [['mue_day', 'warning']]);
  assert.equal(checkEdits([claim([{ code: 'A0001', units: 3 }])], { mue }).findings[0].kind, 'mue_line');
});

test('an accepted payer pair edit adds an error from the next run, and only for that payer', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  const args = { claims: 'batch-ncci.837', ptp: 'ncci-ptp-practitioner.csv', claim_id: 'G1010' };
  assert.equal((await rt.call('edits_explain', args)).result.findings.length, 0);
  const l = await rt.call('edits_learn', { kind: 'payer_pair_edit', value: { payer: 'Sample Mutual Insurance', column_1: '99396', column_2: '99213' } });
  const ask = await rt.call('edits_accept_learning', { id: l.result.fact.id, decision: 'accept' });
  rt.approvals.approve(ask.approval_id, 'Cory Coder (fictional)');
  await rt.call('edits_accept_learning', { id: l.result.fact.id, decision: 'accept' });
  const after = await rt.call('edits_explain', args);
  assert.deepEqual(after.result.findings.map((f) => [f.kind, f.fact_id]), [['payer_pair', l.result.fact.id]]);
  const other = await rt.call('edits_check', { claims: 'batch-ncci.837', ptp: 'ncci-ptp-practitioner.csv' });
  assert.equal(other.result.by_kind.payer_pair, 1);
});

test('the CMS layout is recognised below its title lines', async () => {
  const rt = new AgentRuntime(manifest, { root: sandbox() });
  const r = await rt.call('edits_check', { claims: 'batch-ncci.837', ptp: 'ncci-ptp-practitioner.csv', mue: 'ncci-mue-practitioner.csv' });
  assert.equal(r.result.ptp_pairs, 6); assert.equal(r.result.mue_codes, 4);
  assert.ok((r.sources || []).some((s) => s.profile === 'cms_ncci_ptp'), JSON.stringify(r.sources));
});
