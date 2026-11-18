// Domain checks for payment plans (ver 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewPlans, planOptions, dueDates } from '../src/logic.js';

const plan = (id, o = {}) => ({ plan_id: id, account: o.account || `A-${id}`, patient_name: 'Pat Example', original_balance: o.balance ?? 600, monthly_amount: o.monthly ?? 100, start_date: o.start ?? '2025-11-01', day_of_month: o.day ?? 1 });
const pay = (id, date, amount) => ({ plan_id: id, date, amount });
const run = (plans, payments, config = {}, asOf = '2026-02-15') => reviewPlans(plans, payments, { config, asOf });

test('installments due stop at the grace date: a payment due on the 1st is not missed on the 5th with 10 days of grace', () => {
  assert.deepEqual(dueDates('2025-11-01', 1, '2026-02-05'), ['2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01']);
  const r = run([plan('P1')], [pay('P1', '2025-11-01', 100), pay('P1', '2025-12-01', 100), pay('P1', '2026-01-01', 100)], { grace_days: 10 }, '2026-02-05');
  assert.deepEqual([r.items[0].installments_due, r.items[0].status], [3, 'current']);
});

test('one missed installment is a reminder; the configured number of misses is a review for a person to decide', () => {
  const r = run([plan('M1'), plan('M2')], [pay('M1', '2025-11-01', 100), pay('M1', '2025-12-01', 100), pay('M1', '2026-01-01', 100), pay('M2', '2025-11-01', 100)], { default_after_missed: 2 });
  const by = Object.fromEntries(r.items.map((i) => [i.plan_id, i]));
  assert.deepEqual([by.M1.status, by.M1.missed], ['missed_payment', 1]);
  assert.deepEqual([by.M2.status, by.M2.missed, by.M2.shortfall], ['default_review', 3, 300]);
  assert.match(by.M2.message, /a person decides/);
  assert.equal(r.items[0].plan_id, 'M2');
});

test('ahead, paid off, and expected payments never above the balance', () => {
  const r = run([plan('A', { balance: 1000 }), plan('F', { balance: 250, monthly: 100 })], [pay('A', '2025-11-01', 500), pay('F', '2025-11-01', 250)]);
  const by = Object.fromEntries(r.items.map((i) => [i.plan_id, i]));
  assert.deepEqual([by.A.status, by.A.paid], ['ahead', 500]);
  assert.deepEqual([by.F.status, by.F.expected_paid, by.F.remaining], ['paid_off', 250, 0]);
});

test('policy notes: a monthly amount below the minimum and a term over the tier limit', () => {
  const r = run([plan('L', { balance: 2400, monthly: 20 })], [pay('L', '2025-11-01', 2400)], { min_payment: 25, tiers: [{ up_to: 500, max_months: 6 }, { up_to: 5000, max_months: 24 }] });
  assert.deepEqual(r.items[0].policy, []);
  const open = run([plan('L', { balance: 2400, monthly: 20 })], [], { min_payment: 25, tiers: [{ up_to: 500, max_months: 6 }, { up_to: 5000, max_months: 24 }] });
  assert.deepEqual(open.items[0].policy, ['Monthly 20 is below your minimum 25.', 'Term of 120 months is over your 24-month limit for this balance.']);
});

test('options never run past the policy\'s longest term, and that term is offered even when it is not a standard length', () => {
  const short = planOptions(1000, { config: { min_payment: 25, tiers: [{ up_to: 5000, max_months: 2 }] } });
  assert.deepEqual(short.options, [{ months: 2, monthly: 500, last_payment: 500 }]);
  const ten = planOptions(1000, { config: { min_payment: 25, tiers: [{ up_to: 5000, max_months: 10 }] } });
  assert.deepEqual(ten.options.map((o) => o.months), [3, 6, 10]);
  assert.equal(ten.options[2].monthly, 100);
});

test('a small balance gets one plan at the minimum payment, and the last payment makes the total exact', () => {
  const o = planOptions(60, { config: { min_payment: 25 } });
  assert.deepEqual(o.options, [{ months: 3, monthly: 25, last_payment: 10 }]);
  const odd = planOptions(100, { config: { min_payment: 10 } });
  for (const x of odd.options) assert.equal(Math.round((x.monthly * (x.months - 1) + x.last_payment) * 100) / 100, 100);
});
