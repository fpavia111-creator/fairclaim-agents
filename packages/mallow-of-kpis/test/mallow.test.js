import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRuntime } from 'remedy-core';
import { manifest, computeKpis } from '../src/index.js';

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const sandbox = () => { const root = mkdtempSync(join(tmpdir(), 'mallow-')); cpSync(fixtures, root, { recursive: true }); return root; };
const claim = (id, charge, o = {}) => ({ claim_id: id, patient_name: 'A', payer_name: o.payer || 'Plan', provider: 'Dr A', service_from: o.dos || '2026-01-02', submitted_date: o.sent === undefined ? '2026-01-04' : o.sent, total_charge: charge, lines: [{ code: '99213', charge, date_from: o.dos || '2026-01-02' }] });
const remit = (id, charge, paid, cas, date = '2026-01-20', status = '1') => ({ claim_id: id, status, charge, paid, patient_responsibility: cas.filter((c) => c.group === 'PR').reduce((s, c) => s + c.amount, 0), payer: 'Plan', payment_date: date, adjustments: cas, remarks: [], lines: [] });
const ca = (group, reason, amount) => ({ group, reason, amount });

test('net collection counts denials as owed, not as write-downs', () => {
  const o = computeKpis([claim('A', 100), claim('B', 100)], [remit('A', 100, 50, [ca('CO', '45', 30), ca('PR', '3', 20)]), remit('B', 100, 0, [ca('CO', '197', 100)], '2026-01-20', '4')], { asOf: '2026-02-01' });
  assert.equal(o.net_collection_rate, 33.33); // 50 paid of 50 + 100 owed
  assert.equal(o.denial_rate, 50); assert.equal(o.first_pass_rate, 50); assert.equal(o.ar_balance, 100);
});

test('a claim paid on a second remittance is not first pass, and days to pay run to the paying one', () => {
  const o = computeKpis([claim('A', 100)], [remit('A', 100, 0, [ca('CO', '16', 100)], '2026-01-10', '4'), remit('A', 100, 70, [ca('CO', '45', 30)], '2026-02-09')], { asOf: '2026-02-15' });
  assert.equal(o.first_pass_rate, 0); assert.equal(o.denial_rate, 100); assert.equal(o.median_days_to_pay, 36); assert.equal(o.net_collection_rate, 100);
});

test('remittances after the as-of date are ignored; without a submitted date days count from service', () => {
  const o = computeKpis([claim('A', 100, { sent: null })], [remit('A', 100, 70, [ca('CO', '45', 30)], '2026-03-01')], { asOf: '2026-02-15' });
  assert.equal(o.adjudicated, 0); assert.equal(o.open[0].days_open, 44);
  assert.match(o.data_notes.join(' '), /no submitted date/);
});

test('targets judge each KPI the right way round; no targets, no verdicts', () => {
  const c = [claim('A', 100)]; const r = [remit('A', 100, 70, [ca('CO', '45', 30)])];
  const o = computeKpis(c, r, { asOf: '2026-02-01', config: { targets: { denial_rate: 5, first_pass_rate: 99, median_days_to_pay: 10 } } });
  assert.equal(o.kpis.denial_rate.met, true); assert.equal(o.kpis.first_pass_rate.met, true); assert.equal(o.kpis.median_days_to_pay.met, false);
  assert.equal(computeKpis(c, r, { asOf: '2026-02-01' }).kpis.denial_rate.met, null);
});

test('a learned payer watch adds an alert with the fact id', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  const f = { claims: 'claims-2025-11-to-2026-01.csv', remits: 'remits-2025-11-to-2026-02.835', config: 'kpi-config.json' };
  const before = (await rt.call('mallow_kpis', f)).result.alerts.length;
  const l = await rt.call('mallow_learn', { kind: 'payer_kpi_watch', value: { payer: 'Demo Medicaid Plan', kpi: 'median_days_to_pay', limit: 30, note: 'Slow since the portal change (fictional)' } });
  const ask = await rt.call('mallow_accept_learning', { id: l.result.fact.id, decision: 'accept' });
  rt.approvals.approve(ask.approval_id, 'Pat Practice Manager (fictional)');
  assert.equal((await rt.call('mallow_accept_learning', { id: l.result.fact.id, decision: 'accept' })).status, 'executed');
  const alerts = (await rt.call('mallow_kpis', f)).result.alerts;
  assert.equal(alerts.length, before + 1);
  const a = alerts.find((x) => x.source === 'memory');
  assert.equal(a.fact_id, l.result.fact.id); assert.match(a.message, /Demo Medicaid Plan: median days to pay is 45 days/);
});
