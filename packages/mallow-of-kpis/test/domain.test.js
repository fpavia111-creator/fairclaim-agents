// Domain checks for revenue cycle KPIs (ver 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRuntime } from 'remedy-core';
import { manifest } from '../src/index.js';
import { computeKpis } from '../src/logic.js';

const claim = (id, charge, o = {}) => ({ claim_id: id, patient_name: 'Pat Example', payer_name: o.payer || 'Example Health Plan', provider: o.provider || 'Dr A', service_from: o.dos || '2026-01-02', submitted_date: o.sent === undefined ? '2026-01-04' : o.sent, total_charge: charge, lines: [{ code: '99213', charge, date_from: o.dos || '2026-01-02' }] });
const remit = (id, charge, paid, cas, date = '2026-01-20', status = '1') => ({ claim_id: id, status, charge, paid, patient_responsibility: cas.filter((c) => c.group === 'PR').reduce((s, c) => s + c.amount, 0), payer: 'Example Health Plan', payment_date: date, adjustments: cas, remarks: [], lines: [] });
const ca = (group, reason, amount) => ({ group, reason, amount });

test('the provider breakdown is returned (it was lost in ver 1) and the tool answers for it', async () => {
  const r = computeKpis([claim('1', 100), claim('2', 100, { provider: 'Dr B' })], [remit('1', 100, 80, [ca('CO', '45', 20)])], { asOf: '2026-02-01' });
  assert.deepEqual(r.by_provider.map((p) => [p.group, p.claims, p.adjudicated]), [['Dr A', 1, 1], ['Dr B', 1, 0]]);
  const root = mkdtempSync(join(tmpdir(), 'mallow-')); cpSync(fileURLToPath(new URL('../fixtures', import.meta.url)), join(root, 'fixtures'), { recursive: true });
  const rt = new AgentRuntime(manifest, { root });
  const out = await rt.call('mallow_breakdown', { claims: 'fixtures/claims-2025-11-to-2026-01.csv', remits: 'fixtures/remits-2025-11-to-2026-02.835', config: 'fixtures/kpi-config.json', group: 'provider' });
  assert.ok(!out.isError, JSON.stringify(out).slice(0, 300));
});

test('denial rate and first pass count claims; the denied amount rate counts dollars', () => {
  const r = computeKpis([claim('1', 100), claim('2', 300), claim('3', 100)], [remit('1', 100, 80, [ca('CO', '45', 20)]), remit('2', 300, 0, [ca('CO', '197', 300)], '2026-01-20', '4'), remit('3', 100, 50, [ca('CO', '45', 20), ca('PR', '2', 30)])], { asOf: '2026-02-01' });
  assert.deepEqual([r.denial_rate, r.first_pass_rate, r.denied_amount_rate], [33.33, 66.67, 60]);
});

test('patient responsibility is not owed by the payer, so a claim paid in full after coinsurance collects 100 percent', () => {
  const r = computeKpis([claim('1', 100)], [remit('1', 100, 50, [ca('CO', '45', 20), ca('PR', '2', 30)])], { asOf: '2026-02-01' });
  assert.equal(r.net_collection_rate, 100);
  assert.equal(r.ar_balance, 0);
});

test('no response: only claims sent longer ago than the window count, and they are listed oldest first', () => {
  const r = computeKpis([claim('old', 100, { sent: '2025-12-01', dos: '2025-11-28' }), claim('new', 100, { sent: '2026-01-25', dos: '2026-01-24' }), claim('paid', 100, { sent: '2025-12-01', dos: '2025-11-28' })], [remit('paid', 100, 100, [], '2025-12-20')], { asOf: '2026-02-01', config: { no_response_days: 30 } });
  assert.equal(r.no_response_rate, 50);
  assert.deepEqual(r.open.map((o) => [o.claim_id, o.overdue]), [['old', true], ['new', false]]);
  assert.match(r.alerts.find((a) => a.kpi === 'no_response').message, /1 claim\(s\) worth 100.00/);
});

test('days in A/R divides the open balance by average daily charges over the period; months show none', () => {
  const r = computeKpis([claim('1', 900, { dos: '2026-01-10' }), claim('2', 900, { dos: '2026-01-20' })], [remit('1', 900, 900, [], '2026-01-25')], { asOf: '2026-02-01', config: { period_days: 90 } });
  assert.equal(r.days_in_ar, 45);
  assert.ok(r.by_month.every((m) => m.days_in_ar === null));
});

test('remittances for claims not in the claims file are left out and named in the data notes', () => {
  const r = computeKpis([claim('1', 100)], [remit('1', 100, 100, []), remit('ZZ9', 50, 50, [])], { asOf: '2026-02-01' });
  assert.equal(r.adjudicated, 1);
  assert.match(r.data_notes[0], /1 remittance claim\(s\) match no claim in the claims file \(ZZ9\)/);
});
