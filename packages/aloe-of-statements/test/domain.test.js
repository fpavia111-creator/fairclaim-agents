// Domain checks for the statement cycle, written against Aloe's own rules (ver 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statementCycle, STAGES } from '../src/logic.js';

const asOf = '2026-02-20';
const acct = (over) => ({ account: 'A-1', patient_name: 'Pat Example', balance: '120.00', statements_sent: '0', ...over });
const one = (over, opts = {}) => statementCycle([acct(over)], { asOf, ...opts }).items[0];

test('the cycle runs first, second, final notice, then collections review after the wait', () => {
  assert.equal(one({ statements_sent: '0' }).action, 'first_statement');
  assert.equal(one({ statements_sent: '1', last_statement: '2026-01-15' }).action, 'second_statement');
  const final = one({ statements_sent: '2', last_statement: '2026-01-15' });
  assert.equal(final.action, 'final_notice'); assert.match(final.message, /how to ask for help/);
  const coll = one({ statements_sent: '3', last_statement: '2026-01-15' });
  assert.equal(coll.action, 'collections_review'); assert.match(coll.message, /financial assistance first/);
  const wait = one({ statements_sent: '3', last_statement: '2026-02-10' });
  assert.deepEqual([wait.action, wait.hold], ['hold', 'not_due']);
  assert.deepEqual(STAGES, ['first_statement', 'second_statement', 'final_notice']);
});

test('a statement inside the cycle is not due; a shorter cycle in the config makes it due', () => {
  const r = { statements_sent: '1', last_statement: '2026-02-01' };
  assert.equal(one(r).hold, 'not_due');
  assert.equal(one(r, { config: { cycle_days: 14 } }).action, 'second_statement');
});

test('holds in order: insurance pending beats a payment plan and a bad address', () => {
  const it = one({ insurance_pending: '40', on_plan: 'yes', address_status: 'returned mail' });
  assert.equal(it.hold, 'insurance_pending'); assert.match(it.message, /^40 is still with insurance/);
  assert.equal(one({ on_plan: 'Active', address_status: 'bad' }).hold, 'on_payment_plan');
  for (const s of ['Returned', 'undeliverable', 'BAD ADDRESS', 'invalid']) assert.equal(one({ address_status: s }).hold, 'bad_address', s);
  assert.equal(one({ address_status: 'verified' }).action, 'first_statement');
});

test('minimum balance: under it is held, exactly at it is billed', () => {
  assert.equal(one({ balance: '4.99' }).hold, 'small_balance');
  assert.equal(one({ balance: '5' }).action, 'first_statement');
  assert.equal(one({ balance: '19.99' }, { config: { min_balance: 20 } }).hold, 'small_balance');
});

test('a payment within the recent window skips the cycle; one day later it does not', () => {
  assert.equal(one({ last_payment: '2026-02-06' }).hold, 'recent_payment');
  assert.equal(one({ last_payment: '2026-02-05' }).action, 'first_statement');
  assert.equal(one({ last_payment: '2026-02-05' }, { config: { recent_payment_days: 30 } }).hold, 'recent_payment');
});

test('built-in hold words: estate and bankruptcy are legal holds, disputes and hardship have their own', () => {
  for (const [note, hold] of [['Patient deceased, estate contact pending', 'legal_hold'], ['Chapter 13 filed', 'legal_hold'], ['Disputes the anesthesia charge', 'dispute_hold'], ['Applied for financial assistance', 'hardship_review']]) {
    const it = one({ notes: note, statements_sent: '2', last_statement: '2026-01-01' });
    assert.deepEqual([it.action, it.hold], ['hold', hold], note);
  }
});

test('a learned hold word is matched literally, not as a pattern', () => {
  const facts = [{ id: 'MEM-aaaaaaaaaaaa', value: { word: 'W.C. (claim)', hold: 'insurance_pending', note: 'workers comp' } }];
  assert.equal(one({ notes: 'W.C. (claim) open' }, { facts }).fact_id, 'MEM-aaaaaaaaaaaa');
  assert.equal(one({ notes: 'WXC claim open' }, { facts }).action, 'first_statement');
});

test('final notices sort first, then by balance; totals cover only statements to send', () => {
  const rows = [acct({ account: 'A-1', balance: '50' }), acct({ account: 'A-2', balance: '300' }), acct({ account: 'A-3', balance: '75', statements_sent: '2', last_statement: '2026-01-10' }), acct({ account: 'A-4', balance: '900', on_plan: 'y' }), acct({ account: 'A-5', balance: '-20' })];
  const r = statementCycle(rows, { asOf });
  assert.deepEqual(r.items.map((i) => i.account), ['A-3', 'A-2', 'A-1', 'A-4']);
  assert.equal(r.accounts, 4); assert.equal(r.to_send, 3); assert.equal(r.to_send_balance, 425); assert.equal(r.held, 1);
  assert.deepEqual(r.by_action, { final_notice: 1, first_statement: 2, 'hold:on_payment_plan': 1 });
});

test('workers compensation is a built-in hold: the carrier is billed, not the injured worker', () => {
  for (const note of ['Workers comp claim', "Workers' compensation case 22-114", "workman's comp", 'Work comp - see notes', 'work-related injury']) {
    const it = one({ notes: note });
    assert.deepEqual([it.action, it.hold], ['hold', 'workers_comp'], note);
    assert.match(it.message, /bill the carrier, not the patient/);
  }
  for (const note of ['Complained about wait time', 'Works at Comp USA (fictional)', 'homework complete']) assert.notEqual(one({ notes: note }).hold, 'workers_comp', note);
});
