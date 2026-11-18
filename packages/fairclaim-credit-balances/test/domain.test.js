// Domain checks for credit balances and refund deadlines (ver 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewCredits, refundRule } from '../src/logic.js';

const credit = (account, o = {}) => ({ account, patient_name: 'Pat Example', amount: -50, credit_date: '2026-01-10', identified_date: '2026-01-10', ...o });
const run = (rows, config = {}, facts = []) => reviewCredits(rows, { config, facts, asOf: '2026-02-15' });
const one = (row, config) => run([row], config).items[0];

test('"Self-funded" plans and BlueCard payments are payer overpayments, not patient credits', () => {
  assert.equal(one(credit('1', { payer: 'Example Self-Funded Plan', payment_source: 'Example Self-Funded Plan' })).kind, 'payer_overpayment');
  assert.equal(one(credit('2', { payer: 'Example BlueCard Plan', payment_source: 'BlueCard' })).kind, 'payer_overpayment');
  assert.equal(one(credit('3', { payment_source: 'Copay' })).kind, 'patient_credit');
  assert.equal(one(credit('4', { payment_source: 'Self' })).kind, 'patient_credit');
  assert.equal(one(credit('5', { payer: 'Example Health Plan', responsible: 'Patient' })).kind, 'patient_credit');
});

test('Medicaid overpayments get the same 60-day rule as Medicare', () => {
  assert.deepEqual(refundRule('State Medicaid Example'), { days: 60, source: 'medicare_rule' });
  const it = one(credit('M', { payer: 'State Medicaid Example', identified_date: '2025-12-01' }));
  assert.equal(it.action, 'refund_overdue');
  assert.match(it.message, /60 days from identification for Medicare and Medicaid/);
});

test('inside the warning days a payer refund is due now; a payer with no rule is told to refund promptly', () => {
  const now = one(credit('N', { payer: 'Example Health Plan', identified_date: '2026-01-10' }), { payers: [{ name: 'Example Health Plan', refund_days: 45 }], warn_days: 14 });
  assert.deepEqual([now.action, now.days_left, now.refund_deadline], ['refund_now', 9, '2026-02-24']);
  const none = one(credit('O', { payer: 'Sample Mutual' }));
  assert.equal(none.action, 'refund');
  assert.match(none.message, /No refund deadline set for this payer/);
});

test('a patient credit is applied to an open balance first, then checked for unclaimed-property age, then the small-credit level', () => {
  const cfg = { escheat_days: 1095, small_credit: 5 };
  assert.equal(one(credit('D', { payment_source: 'Patient', open_debit: 30 }), cfg).action, 'apply_to_balance');
  assert.equal(one(credit('E', { payment_source: 'Patient', credit_date: '2023-01-01' }), cfg).action, 'escheat_risk');
  assert.equal(one(credit('S', { payment_source: 'Patient', amount: -3 }), cfg).action, 'small_credit');
  assert.equal(one(credit('R', { payment_source: 'Patient' }), cfg).action, 'refund');
});

test('a payer overpayment is never treated as a small credit, however small', () => {
  const it = one(credit('P', { payer: 'Medicare', amount: -1, identified_date: '2026-02-10' }), { small_credit: 5 });
  assert.equal(it.action, 'refund');
  assert.equal(it.kind, 'payer_overpayment');
});

test('totals split patient and payer money, and overdue refunds come first', () => {
  const r = run([credit('a', { payment_source: 'Patient', amount: 20 }), credit('b', { payer: 'Medicare', amount: -100, identified_date: '2025-11-01' }), credit('c', { payer: 'Medicare', amount: -40, identified_date: '2026-02-01' })]);
  assert.deepEqual([r.total, r.patient_total, r.payer_total, r.overdue_total], [160, 20, 140, 100]);
  assert.equal(r.items[0].account, 'b');
});
