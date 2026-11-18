// Domain checks for remittances against deposits and provider-level adjustments (ver 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchPayments, explainPlb, likelyPayer, depositTraces } from '../src/logic.js';

const pay = (trace, amount, date = '2026-02-02', o = {}) => ({ trace_number: trace, payer: o.payer || 'Example Health Plan', date, amount, method: o.method || 'ACH' });
const dep = (id, amount, date = '2026-02-03', o = {}) => ({ deposit_id: id, amount, date, description: o.description || '', trace_number: o.trace || '' });

test('a trace number match wins over an amount match, and a different amount on the same trace is a mismatch', () => {
  const r = matchPayments([pay('EFT-100', 500), pay('EFT-200', 300)], [dep('D1', 500, '2026-02-02'), dep('D2', 480, '2026-02-04', { description: 'HCCLAIMPMT TRN*1*EFT100*1999999999' }), dep('D3', 300, '2026-02-03', { trace: 'eft 200' })]);
  const by = Object.fromEntries(r.rows.map((x) => [x.trace_number, x]));
  assert.deepEqual([by['EFT-100'].status, by['EFT-100'].deposit_id, by['EFT-100'].difference], ['amount_mismatch', 'D2', 20]);
  assert.deepEqual([by['EFT-200'].status, by['EFT-200'].deposit_id], ['matched', 'D3']);
  assert.equal(r.unmatched_deposits[0].deposit_id, 'D1');
  assert.equal(r.mismatch_total, 20);
});

test('an amount match takes the closest date, and each deposit is used once', () => {
  const r = matchPayments([pay('', 200, '2026-02-10'), pay('', 200, '2026-02-10')], [dep('far', 200, '2026-02-14'), dep('near', 200, '2026-02-11'), dep('out', 200, '2026-02-20')], { windowDays: 5 });
  assert.deepEqual(r.rows.map((x) => [x.deposit_id, x.status]), [['near', 'matched_review'], ['far', 'matched_by_amount']]);
  assert.equal(r.unmatched_deposits[0].deposit_id, 'out');
});

test('a zero payment expects no money; a paper check with no deposit points to the lockbox', () => {
  const r = matchPayments([pay('0', 0), pay('CHK-1', 75, '2026-02-02', { method: 'CHK' })], []);
  assert.deepEqual(r.rows.map((x) => x.status), ['no_money_expected', 'no_deposit']);
  assert.match(r.rows[1].note, /lockbox/);
  assert.deepEqual([r.need_review, r.no_deposit_total], [1, 75]);
});

test('deposits without a remittance: insurance-looking text or a known payer name counts, other deposits and ignored text do not', () => {
  const r = matchPayments([pay('X', 10)], [dep('a', 120, '2026-02-03', { description: 'EXAMPLE HEALTH PLAN PAYMENT' }), dep('b', 60, '2026-02-03', { description: 'HCCLAIMPMT SOMEONE' }), dep('c', 40, '2026-02-03', { description: 'CARD SETTLEMENT' }), dep('d', 999, '2026-02-03', { description: 'TRANSFER FROM SAVINGS' })], { ignore: ['transfer from'] });
  const by = Object.fromEntries(r.unmatched_deposits.map((x) => [x.deposit_id, x]));
  assert.deepEqual([by.a.status, by.a.likely_payer, by.b.status, by.c.status], ['deposit_without_era', 'Example Health Plan', 'deposit_without_era', 'not_insurance']);
  assert.equal(by.d, undefined);
  assert.equal(r.deposits_without_era_total, 180);
});

test('a bank text taught by a person names the payer before the name match', () => {
  const lp = likelyPayer({ description: 'EHP CLMPAY 0201' }, ['Example Health Plan'], [{ id: 'f9', bank_text: 'ehp clmpay', payer: 'Example Health Plan' }]);
  assert.deepEqual(lp, { payer: 'Example Health Plan', by: 'memory', fact_id: 'f9' });
  assert.deepEqual(depositTraces({ trace_number: '', description: 'ACH TRN*1*12345*1512345678\\ TRN*1*67890*1' }), ['12345', '67890']);
});

test('interest is posted as income; late filing penalties (50, 51, L3) are penalties, not interest', () => {
  const p = explainPlb([{ reason: 'L6', amount: -3 }, { reason: '50', amount: 25 }, { reason: '51', amount: 4 }, { reason: 'L3', amount: 10 }, { reason: 'LE', amount: 100 }]);
  const step = Object.fromEntries(p.items.map((x) => [x.reason, x.next_step]));
  assert.match(step.L6, /interest income/);
  for (const r of ['50', '51', 'L3']) assert.match(step[r], /penalty, not as interest/);
  assert.match(step.LE, /Levy/);
  assert.deepEqual([p.reduced, p.added], [139, 3]);
});

test('recoveries are posted against the claim they recover; the reasons are summed by code', () => {
  const p = explainPlb([{ reason: 'WO', amount: 40, reference: 'CLM-1' }, { reason: 'WO', amount: 15.5 }, { reason: 'FB', amount: -20 }]);
  assert.match(p.items[0].next_step, /not as unapplied cash/);
  assert.deepEqual(p.by_reason, { WO: 55.5, FB: -20 });
  assert.equal(p.items[2].effect, 'added to the payment');
});
