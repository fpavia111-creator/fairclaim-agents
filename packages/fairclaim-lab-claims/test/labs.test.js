import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRuntime } from 'fairclaim-core';
import { manifest, checkLabs, PANELS } from '../src/index.js';

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const sandbox = () => { const root = mkdtempSync(join(tmpdir(), 'labs-')); cpSync(fixtures, root, { recursive: true }); return root; };
const claim = (id, codes, o = {}) => ({ claim_id: id, patient_name: 'A', member_id: o.member || 'M1', payer_name: 'Plan', clia: o.clia ?? '02D0999999', service_from: '2026-02-10', diagnoses: (o.dx || ['E11.9']).map((code) => ({ code })), lines: codes.map((c, i) => { const [code, ...mods] = c.split('-'); return { line: i + 1, code, modifiers: mods, units: 1, charge: 10, date_from: o.date || '2026-02-10' }; }) });

test('every CMP component billed separately suggests 80053, not 80048 too', () => {
  const r = checkLabs([claim('C', PANELS['80053'].components)]);
  const msgs = r.items[0].issues.filter((i) => i.check === 'unbundled_panel').map((i) => i.code);
  assert.deepEqual(msgs, ['80053']);
});

test('a panel on one claim and its component on another claim the same day is caught', () => {
  const r = checkLabs([claim('A', ['80061']), claim('B', ['83718'])]);
  assert.equal(r.items.find((i) => i.claim_id === 'B').issues[0].check, 'panel_component');
});

test('91 marks a same-day repeat as intended; 59 too', () => {
  assert.equal(checkLabs([claim('A', ['85025', '85025-91'])]).errors, 0);
  assert.equal(checkLabs([claim('A', ['85025', '85025'])]).items[0].issues[0].check, 'repeat');
});

test('venipuncture once a day across claims; a claim without lab tests or venipuncture is skipped', () => {
  const r = checkLabs([claim('A', ['36415']), claim('B', ['36415']), claim('C', ['99213'])]);
  assert.equal(r.claims, 2); assert.equal(r.by_check.venipuncture, 1);
});

test('the configured CLIA must match the claim', () => {
  const r = checkLabs([claim('A', ['85025'], { clia: '02D0000001' })], [], { config: { clia: '02D0999999' } });
  assert.match(r.items[0].issues[0].message, /is not your lab's/);
});

test('a learned diagnosis rule warns for that payer, with the fact id', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  const f = { claims: 'lab-claims-2026-02.837', check: 'diagnosis' };
  assert.equal((await rt.call('labs_check', f)).result.items.length, 0);
  const l = await rt.call('labs_learn', { kind: 'lab_dx_rule', value: { code: '85025', dx_prefixes: ['D5', 'D6', 'R53'], payer: 'Sample Mutual Insurance', note: 'Denied with a screening code only (fictional)' } });
  const ask = await rt.call('labs_accept_learning', { id: l.result.fact.id, decision: 'accept' });
  rt.approvals.approve(ask.approval_id, 'Kim Lab Billing Lead (fictional)');
  assert.equal((await rt.call('labs_accept_learning', { id: l.result.fact.id, decision: 'accept' })).status, 'executed');
  const l2 = await rt.call('labs_learn', { kind: 'lab_dx_rule', value: { code: '84443', dx_prefixes: ['E03', 'E05'], payer: 'Example Health Plan' } });
  const ask2 = await rt.call('labs_accept_learning', { id: l2.result.fact.id, decision: 'accept' });
  rt.approvals.approve(ask2.approval_id, 'Kim Lab Billing Lead (fictional)');
  await rt.call('labs_accept_learning', { id: l2.result.fact.id, decision: 'accept' });
  const items = (await rt.call('labs_check', f)).result.items;
  assert.deepEqual(items.map((i) => i.claim_id), ['L8001']);
  assert.equal(items[0].fact_id, l2.result.fact.id);
});
