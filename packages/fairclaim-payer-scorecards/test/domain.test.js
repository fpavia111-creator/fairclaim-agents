// Domain checks for the payer scorecard and trend (ver 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scorePayers } from '../src/logic.js';

const remit = (id, payer, date, o = {}) => ({ claim_id: id, payer, payment_date: date, status: '1', charge: 100, paid: 80, patient_responsibility: 0, adjustments: [{ group: 'CO', reason: '45', amount: 20 }], remarks: [], lines: [], ...o });
const denied = (id, payer, date, reason = '197') => remit(id, payer, date, { status: '4', paid: 0, adjustments: [{ group: 'CO', reason, amount: 100 }] });
const sub = (pairs) => new Map(pairs);

test('days to pay run from the submitted date; claims with no submitted date are counted as untimed', () => {
  const r = scorePayers([remit('a', 'Example Health Plan', '2026-01-21'), remit('b', 'Example Health Plan', '2026-02-10'), remit('c', 'Example Health Plan', '2026-02-10')], { submitted: sub([['a', '2026-01-01'], ['b', '2026-01-01']]) });
  const p = r.payers[0];
  assert.deepEqual([p.days_to_pay_median, p.days_to_pay_avg, p.within_30_percent, p.timed_claims], [30, 30, 50, 2]);
  assert.equal(r.untimed_claims, 1);
});

test('a contractual write-down is not a denial; a denial counts once per claim and is grouped by category', () => {
  const r = scorePayers([remit('a', 'P', '2026-01-10'), denied('b', 'P', '2026-01-10', '197'), remit('c', 'P', '2026-01-10', { adjustments: [{ group: 'CO', reason: '45', amount: 10 }, { group: 'CO', reason: '97', amount: 10 }, { group: 'CO', reason: '97', amount: 5 }] })]);
  const p = r.payers[0];
  assert.equal(p.denied_claims, 2);
  assert.equal(p.denial_rate, 66.67);
  assert.equal(p.top_denials.length, 2);
});

test('a payer\'s own target replaces the general one', () => {
  const config = { targets: { days_to_pay: 20 }, payers: [{ name: 'slow plan', days_to_pay: 45 }] };
  const r = scorePayers([remit('a', 'Slow Plan', '2026-02-10'), remit('b', 'Fast Plan', '2026-02-10')], { submitted: sub([['a', '2026-01-01'], ['b', '2026-01-01']]), config });
  const by = Object.fromEntries(r.payers.map((p) => [p.payer, p.flags.map((f) => f.flag)]));
  assert.deepEqual(by, { 'Slow Plan': [], 'Fast Plan': ['slow'] });
});

test('paid percent below the target is flagged, and payers with more flags come first', () => {
  const r = scorePayers([remit('a', 'Low Payer', '2026-01-10', { paid: 40 }), denied('b', 'Low Payer', '2026-01-10'), remit('c', 'Good Payer', '2026-01-10')], { config: { targets: { paid_percent: 60, denial_rate: 10 } } });
  assert.equal(r.payers[0].payer, 'Low Payer');
  assert.deepEqual(r.payers[0].flags.map((f) => f.flag), ['high_denials', 'low_paid_percent']);
  assert.deepEqual(r.payers[1].flags, []);
});

test('the trend is one row per payment month, oldest first', () => {
  const r = scorePayers([remit('a', 'P', '2026-02-03'), denied('b', 'P', '2026-01-15'), remit('c', 'P', '2026-01-20', { paid: 50 })]);
  assert.deepEqual(r.payers[0].trend.map((m) => [m.month, m.claims, m.denial_rate, m.paid]), [['2026-01', 2, 50, 50], ['2026-02', 1, 0, 80]]);
});

test('a reversal is flagged for a matching recoupment and does not count in the totals', () => {
  const r = scorePayers([remit('a', 'P', '2026-01-10'), remit('a', 'P', '2026-02-10', { status: '22', charge: -100, paid: -80 })]);
  assert.deepEqual([r.claims, r.payers[0].paid], [1, 80]);
  assert.match(r.payers[0].flags.find((f) => f.flag === 'reversals').message, /matching recoupment/);
});
