import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRuntime } from 'remedy-core';
import { manifest, reconcileCharges, emMix, codeMatches } from '../src/index.js';

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const sandbox = () => { const root = mkdtempSync(join(tmpdir(), 'clover-')); cpSync(fixtures, root, { recursive: true }); return root; };
const F = { appointments: 'appointments-2026-02.csv', charges: 'exports/tebra-charges-2026-02.csv', as_of: '2026-02-12' };
const claim = (id, name, date, codes, extra = {}) => ({ claim_id: id, patient_name: name, provider: extra.provider || 'Dr A', submitted_date: extra.submitted || date, lines: codes.map((c) => ({ code: c, charge: 100, date_from: date })) });

test('code patterns: exact or prefix with *', () => {
  assert.ok(codeMatches('J1030', ['J*'])); assert.ok(codeMatches('20610', ['20610'])); assert.ok(!codeMatches('206100', ['20610']));
});

test('a scheduled visit with no charge is skipped; a cancelled one with no charge too', () => {
  const r = reconcileCharges([{ appointment_id: 'a', date: '2026-02-20', status: 'Scheduled', patient_name: 'X' }, { appointment_id: 'b', date: '2026-02-01', status: 'Cancelled', patient_name: 'Y' }], [], { asOf: '2026-02-10' });
  assert.equal(r.rows.length, 0);
});

test('one charge is matched to one visit only, even for two visits the same day', () => {
  const r = reconcileCharges([{ appointment_id: 'a', date: '2026-02-01', status: 'Completed', patient_name: 'Ann Lee' }, { appointment_id: 'b', date: '2026-02-01', status: 'Completed', patient_name: 'Ann Lee' }], [claim('c1', 'ann  LEE', '2026-02-01', ['99213'])], { asOf: '2026-02-10' });
  assert.deepEqual(r.rows.map((x) => [x.appointment_id, x.status]), [['b', 'missing_charge'], ['a', 'matched']]);
});

test('E/M mix needs five lines before it compares', () => {
  const m = emMix([claim('1', 'a', '2026-01-01', ['99215', '99215', '99215', '99215'], { provider: 'X' }), claim('2', 'b', '2026-01-01', ['99212', '99212', '99212', '99212', '99212'], { provider: 'Y' })]);
  assert.equal(m.find((p) => p.provider === 'X').differs, false);
  assert.equal(m.find((p) => p.provider === 'Y').differs, true);
});

test('memory adds an expected-code check; the row carries the fact id', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  let r = await rt.call('clover_explain', { ...F, ref: 'V105' });
  const l = await rt.call('clover_learn', { kind: 'visit_type_code', value: { visit_type: 'Follow-up', codes: ['99*'], note: 'fictional rule' } });
  const ask = await rt.call('clover_accept_learning', { id: l.result.fact.id, decision: 'accept' });
  rt.approvals.approve(ask.approval_id, 'Lee Billing Lead (fictional)');
  assert.equal((await rt.call('clover_accept_learning', { id: l.result.fact.id, decision: 'accept' })).status, 'executed');
  const l2 = await rt.call('clover_learn', { kind: 'visit_type_code', value: { visit_type: 'Sick', codes: ['87880'] } });
  const ask2 = await rt.call('clover_accept_learning', { id: l2.result.fact.id, decision: 'accept' });
  rt.approvals.approve(ask2.approval_id, 'Lee Billing Lead (fictional)');
  await rt.call('clover_accept_learning', { id: l2.result.fact.id, decision: 'accept' });
  r = await rt.call('clover_explain', { ...F, ref: 'V101' });
  assert.equal(r.result.row.status, 'matched', 'Follow-up visits carry a 99 code');
  r = await rt.call('clover_reconcile', { ...F, status: 'expected_code_missing' });
  assert.deepEqual(r.result.items.map((i) => i.appointment_id), []);
  r = await rt.call('clover_explain', { ...F, ref: 'V105' });
  assert.equal(r.result.row.status, 'charge_on_cancelled', 'a check never hides a worse status');
});

test('the report keeps real names and the E/M section', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  const r = await rt.call('clover_write_report', { ...F, config: 'charge-config.json', language: 'de' });
  assert.equal(r.status, 'executed', r.reason);
  const csv = readFileSync(join(root, 'remedy-out/clover/clover-charges.csv'), 'utf8');
  assert.match(csv.split('\n')[1], /^missing_charge,V103,,Rowan Castellano/);
  assert.match(readFileSync(join(root, 'remedy-out/clover/clover-charges.html'), 'utf8'), /level_4_5_share|66\.67/);
});
