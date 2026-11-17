import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRuntime } from 'remedy-core';
import { manifest, timeUnits, toMinutes, checkAnesthesia } from '../src/index.js';

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const sandbox = () => { const root = mkdtempSync(join(tmpdir(), 'caraway-')); cpSync(fixtures, root, { recursive: true }); return root; };
const base = new Map([['00790', 7]]);
const c = (id, prov, mods, start, end, o = {}) => ({ claim_id: id, case_id: o.case || id, patient_name: 'A', member_id: o.member || id, patient_dob: '1980-01-01', payer: 'P', provider: prov, date: '2026-02-03', code: '00790', modifiers: mods, start: toMinutes(start, '2026-02-03'), end: toMinutes(end, '2026-02-03'), minutes_reported: null, units_reported: null, charge: 0, qc: [], other: [] });

test('time units: tenth, up and nearest', () => {
  assert.equal(timeUnits(40), 2.7); assert.equal(timeUnits(40, { rounding: 'up' }), 3); assert.equal(timeUnits(37, { rounding: 'nearest' }), 2);
  assert.equal(timeUnits(40, { unitMinutes: 10, rounding: 'up' }), 4); assert.equal(timeUnits(0), 0);
});

test('times: 12-hour clock, bare HHMM and ISO all read', () => {
  assert.equal(toMinutes('1:30 PM', '2026-02-03') - toMinutes('13:30', '2026-02-03'), 0);
  assert.equal(toMinutes('0730', '2026-02-03') - toMinutes('2026-02-03T07:00:00', null), 30);
  assert.equal(toMinutes('', '2026-02-03'), null);
});

test('medical direction: five rooms at once needs AD; one room with QK should be QY', () => {
  const rooms = [1, 2, 3, 4, 5].map((n) => c(`M${n}`, 'Dr A', ['QK', 'P2'], '08:00', '09:00', { case: `K${n}` }));
  const r = checkAnesthesia(rooms, base);
  assert.ok(r.items.every((i) => i.concurrency === 5 && i.issues.some((x) => x.check === 'concurrency' && /use AD/.test(x.message))));
  const one = checkAnesthesia([c('S1', 'Dr A', ['QK', 'P2'], '08:00', '09:00'), c('S2', 'CRNA B', ['QX', 'P2'], '08:00', '09:00', { case: 'S1' })], base);
  assert.match(one.items.find((i) => i.claim_id === 'S1').issues.find((x) => x.check === 'concurrency').message, /use QY/);
});

test('back-to-back cases do not overlap; a case that starts as another ends is not concurrent', () => {
  const r = checkAnesthesia([c('B1', 'Dr A', ['AA', 'P1'], '08:00', '09:00'), c('B2', 'Dr A', ['AA', 'P1'], '09:00', '10:00')], base);
  assert.equal(r.errors, 0, JSON.stringify(r.items.map((i) => i.issues)));
});

test('QX without a directing anesthesiologist is an error; QK without its CRNA is a warning', () => {
  const r = checkAnesthesia([c('X1', 'CRNA B', ['QX', 'P2'], '08:00', '09:00'), c('Y1', 'Dr A', ['QY', 'P2'], '10:00', '11:00')], base);
  assert.equal(r.items.find((i) => i.claim_id === 'X1').status, 'error');
  assert.equal(r.items.find((i) => i.claim_id === 'Y1').status, 'warning');
});

test('a learned payer rule turns a missing physical status into an error, with the fact id', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  const f = { cases: 'anesthesia-claims-2026-02-03.csv', base_units: 'anesthesia-base-units-illustrative.csv', check: 'physical_status' };
  assert.equal((await rt.call('caraway_check', f)).result.items[0].status, 'warning');
  const l = await rt.call('caraway_learn', { kind: 'payer_ps_required', value: { payer: 'Example Health Plan', note: 'Denied without P1-P6 (fictional)' } });
  const ask = await rt.call('caraway_accept_learning', { id: l.result.fact.id, decision: 'accept' });
  rt.approvals.approve(ask.approval_id, 'Ana Anesthesia Billing Lead (fictional)');
  assert.equal((await rt.call('caraway_accept_learning', { id: l.result.fact.id, decision: 'accept' })).status, 'executed');
  const item = (await rt.call('caraway_check', f)).result.items[0];
  assert.equal(item.status, 'error'); assert.equal(item.fact_id, l.result.fact.id); assert.match(item.issues[0].message, /Example Health Plan requires one/);
});
