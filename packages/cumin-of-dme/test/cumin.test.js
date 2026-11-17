import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRuntime } from 'remedy-core';
import { manifest, checkDme, itemRule } from '../src/index.js';

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const sandbox = () => { const root = mkdtempSync(join(tmpdir(), 'cumin-')); cpSync(fixtures, root, { recursive: true }); return root; };
const claim = (id, code, mods, date, o = {}) => ({ claim_id: id, patient_name: 'A', member_id: 'M1', payer_name: o.payer || 'Plan', service_from: date, prior_auth: o.pa || null, lines: [{ line: 1, code, modifiers: mods, units: o.units ?? 1, charge: 10, date_from: date, order_date: o.order || null, delivery_date: o.delivered || null }] });

test('capped rental months 1 to 13 need KH, KI, KI, then KJ; month 14 is past the cap', () => {
  const dates = Array.from({ length: 14 }, (_, i) => `2025-${String((i % 12) + 1).padStart(2, '0')}-01`.replace(/^2025-(\d\d)/, (m, mm) => (i >= 12 ? `2026-${mm}` : m)));
  const mods = (m) => ['RR', m === 1 ? 'KH' : m <= 3 ? 'KI' : 'KJ'];
  const r = checkDme(dates.map((d, i) => claim(`C${i + 1}`, 'E0601', mods(i + 1), d)), []);
  const by = Object.fromEntries(r.items.map((i) => [i.rental_month, i.issues.map((x) => x.check).join()]));
  assert.equal(by[13], ''); assert.equal(by[14], 'cap'); assert.equal(by[1], ''); assert.equal(by[4], '');
});

test('a purchase needs no rental month; a rental with no RR, NU or UE is flagged', () => {
  const r = checkDme([claim('A', 'E0601', ['NU'], '2026-01-01'), claim('B', 'E0570', [], '2026-01-01')]);
  assert.equal(r.items.find((i) => i.claim_id === 'A').rental_month, null);
  assert.equal(r.items.find((i) => i.claim_id === 'B').issues[0].check, 'rental_modifier');
});

test('right and left on the same day are two items, not a duplicate', () => {
  const r = checkDme([claim('A', 'L1833', ['NU', 'RT'], '2026-01-05'), claim('B', 'L1833', ['NU', 'LT'], '2026-01-05')]);
  assert.equal(r.errors, 0);
});

test('a date of service before delivery is an error', () => {
  const r = checkDme([claim('A', 'E0114', ['NU'], '2026-01-02', { delivered: '2026-01-05', order: '2026-01-01' })]);
  assert.equal(r.items[0].issues[0].check, 'delivery');
});

test('learned rules only add checks and keep the lowest unit limit', () => {
  const facts = [{ id: 'f1', value: { code: 'A4253', max_units: 3 } }, { id: 'f2', value: { code: 'A4253', max_units: 9, payer: 'Other' } }];
  assert.equal(itemRule('A4253', 'Plan', { facts }).max_units, 3);
  assert.equal(itemRule('A4253', 'Other', { facts }).max_units, 3);
  assert.equal(itemRule('E0601', 'Plan', { facts: [{ id: 'f3', value: { code: 'E0601', kx: true } }] }).category, 'capped_rental');
});

test('a learned KX rule for one payer flags the CPAP for that payer, with the fact id', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  const f = { claims: 'dme-claims-2026-02.csv', history: 'rental-history.csv', check: 'kx' };
  assert.equal((await rt.call('cumin_check', f)).result.items.length, 0);
  const l = await rt.call('cumin_learn', { kind: 'dme_item_rule', value: { code: 'E0601', payer: 'Test Medicare Contractor', kx: true, note: 'Adherence on file before month 4 (fictional)' } });
  const ask = await rt.call('cumin_accept_learning', { id: l.result.fact.id, decision: 'accept' });
  rt.approvals.approve(ask.approval_id, 'Lee DME Billing Lead (fictional)');
  assert.equal((await rt.call('cumin_accept_learning', { id: l.result.fact.id, decision: 'accept' })).status, 'executed');
  const items = (await rt.call('cumin_check', f)).result.items;
  assert.equal(items.length, 1); assert.equal(items[0].code, 'E0601'); assert.equal(items[0].fact_id, l.result.fact.id);
});
