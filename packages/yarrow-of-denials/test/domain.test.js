// Domain checks for the denial worklist and trends (ver 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupRemits } from 'remedy-core';
import { sortDenials, trends } from '../src/logic.js';

const remits = (rows) => groupRemits(rows.map((r) => ({ payer: 'Example Health Plan', code: '99213', billed: 100, paid: 0, payment_date: '2026-01-10', ...r }))).claims;
const den = (id, reason, amount, o = {}) => ({ claim_id: id, billed: amount, adjustment_group: 'CO', adjustment_reason: reason, adjustment_amount: amount, ...o });

test('priority: a near deadline or a large amount is high, an unknown code is for review, small ones are low', () => {
  const r = sortDenials(remits([den('A', '197', 600), den('B', '197', 120), den('C', '197', 50), den('D', 'ZZ9', 50)]), { config: { appeal_days: 180 }, asOf: '2026-02-01' });
  assert.deepEqual(r.items.map((i) => [i.claim_id, i.priority]), [['A', 'high'], ['D', 'review'], ['B', 'medium'], ['C', 'low']]);
  assert.deepEqual(r.unknown_codes, ['CO-ZZ9']);
});

test('a passed appeal deadline goes last and says so, instead of looking urgent', () => {
  const r = sortDenials(remits([den('OLD', '197', 900, { payment_date: '2025-06-01' }), den('NEW', '197', 80)]), { config: { appeal_days: 90 }, asOf: '2026-02-01' });
  assert.deepEqual(r.items.map((i) => [i.claim_id, i.priority]), [['NEW', 'low'], ['OLD', 'deadline_passed']], 'the larger, older denial no longer comes first');
  assert.match(r.items[1].next_step, /^The appeal deadline \(2025-08-30\) has passed: check the payer's rules for a late appeal with good cause/);
});

test('the appeal deadline counts from the payment date with the payer\'s own days', () => {
  const r = sortDenials(remits([den('A', '197', 100), den('B', '197', 100, { payer: 'Sample Mutual' })]), { config: { appeal_days: 180, payers: [{ name: 'Sample Mutual', appeal_days: 60 }] }, asOf: '2026-01-15' });
  const by = Object.fromEntries(r.items.map((i) => [i.claim_id, i]));
  assert.deepEqual([by.A.appeal_by, by.B.appeal_by, by.B.days_left], ['2026-07-09', '2026-03-11', 55]);
  assert.equal(r.deadlines_set, true);
});

test('summaries by category, payer and team add up to the denied amount', () => {
  const r = sortDenials(remits([den('A', '197', 300), den('B', '16', 200), den('C', '29', 100, { payer: 'Sample Mutual' })]), { asOf: '2026-02-01' });
  const sum = (o) => Math.round(Object.values(o).reduce((s, x) => s + x.amount, 0) * 100) / 100;
  assert.equal(r.denied_amount, 600);
  for (const k of ['by_category', 'by_payer', 'by_team']) assert.equal(sum(r[k]), 600, k);
  assert.equal(r.by_payer['Sample Mutual'].amount, 100);
  assert.equal(r.fully_denied_claims, 3);
});

test('trends: payer by category, code and month of payment', () => {
  const r = sortDenials(remits([den('A', '197', 300, { payment_date: '2026-01-10' }), den('B', '197', 200, { payment_date: '2026-02-03', code: '20610' })]), { asOf: '2026-02-15' });
  const t = trends(r);
  const cat = r.items[0].category;
  assert.deepEqual(Object.keys(t.month_by_category).sort(), ['2026-01', '2026-02']);
  assert.equal(t.payer_by_category['Example Health Plan'][cat].amount, 500);
  assert.equal(t.code_by_category['20610'][cat].count, 1);
});

test('a reason code override from the config moves a denial to another category', () => {
  const plain = sortDenials(remits([den('A', '197', 100)]), { asOf: '2026-02-01' }).items[0].category;
  const moved = sortDenials(remits([den('A', '197', 100)]), { config: { reason_codes: { 197: 'documentation' } }, asOf: '2026-02-01' }).items[0].category;
  assert.equal(plain, 'authorization');
  assert.equal(moved, 'documentation');
});

test('an override given as an object keeps its own text', () => {
  const r = sortDenials(remits([den('A', '197', 100)]), { config: { reason_codes: { 197: { category: 'coding', text: 'Example override text' } } }, asOf: '2026-02-01' });
  assert.deepEqual([r.items[0].category, r.items[0].text], ['coding', 'Example override text']);
});
