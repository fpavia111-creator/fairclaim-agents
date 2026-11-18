// Domain checks for A/R aging, timely filing and the follow-up queue (ver 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageClaims } from '../src/logic.js';

const cfg = { payers: [{ name: 'Example Health Plan', timely_days: 90 }], warn_days: 30 };
const row = (id, o = {}) => ({ claim_id: id, payer: 'Example Health Plan', balance: 100, charge: 100, date_of_service: '2026-01-01', ...o });
const run = (rows, config = cfg, asOf = '2026-03-01') => { const r = ageClaims(rows, { config, asOf }); return { r, by: Object.fromEntries(r.items.map((i) => [i.claim_id, i])) }; };

test('unbilled claims: file now inside the warning window, plain unbilled before it, past the limit after it', () => {
  const { by } = run([
    row('soon', { date_of_service: '2025-12-20' }),
    row('early', { date_of_service: '2026-02-20' }),
    row('late', { date_of_service: '2025-11-01' }),
    row('ready', { date_of_service: '2026-02-25', submitted_date: '2026-02-26', status: 'Ready to bill' }),
  ]);
  assert.deepEqual([by.soon.flag, by.soon.filing_days_left], ['file_now', 90 - 71]);
  assert.equal(by.early.flag, 'unbilled');
  assert.equal(by.late.flag, 'past_filing_limit');
  assert.ok(by.late.filing_days_left < 0);
  assert.equal(by.ready.flag, 'unbilled', 'a status of "ready to bill" means not sent, even with a date');
});

test('a claim sent after the limit is flagged filed late and the next step gives both numbers', () => {
  const { by } = run([row('L', { date_of_service: '2025-10-01', submitted_date: '2026-01-15' }), row('OK', { date_of_service: '2025-12-01', submitted_date: '2026-02-28' })]);
  assert.equal(by.L.flag, 'filed_late');
  assert.match(by.L.next_step, /106 days after service; the limit is 90/);
  assert.equal(by.OK.flag, 'waiting', 'exactly 89 days is on time');
});

test('patient balances are kept out of insurance A/R, its aging grid and its filing limits', () => {
  const { r, by } = run([row('P', { responsible: 'Guarantor', balance: 40, date_of_service: '2025-06-01' }), row('I', { submitted_date: '2026-01-02', balance: 60 })]);
  assert.equal(by.P.flag, 'patient_balance');
  assert.equal(by.P.filing_limit, null);
  assert.deepEqual([r.insurance_balance, r.patient_balance], [60, 40]);
  assert.equal(r.aging_by_payer['Example Health Plan'].total, 60);
  assert.equal(r.at_risk_balance, 0, 'an old patient balance is not a filing risk');
});

test('age from the submission date when asked, and over 90 percent follows the buckets', () => {
  const rows = [row('A', { date_of_service: '2025-10-01', submitted_date: '2026-02-20', balance: 300 }), row('B', { date_of_service: '2026-02-20', submitted_date: '2026-02-21', balance: 100 })];
  const big = { payers: [{ name: 'Example Health Plan', timely_days: 365 }] };
  const dos = run(rows, big).r, sub = run(rows, { ...big, age_from: 'submitted' }).r;
  assert.equal(dos.items.find((i) => i.claim_id === 'A').bucket, '120+');
  assert.equal(dos.over_90_percent, 75);
  assert.equal(sub.items.find((i) => i.claim_id === 'A').bucket, '0-30');
  assert.equal(sub.over_90_percent, 0);
});

test('follow up only after the follow-up days and the quiet window have both passed', () => {
  const { by } = run([
    row('quiet', { date_of_service: '2026-01-01', submitted_date: '2026-01-02', last_activity: '2026-01-20' }),
    row('worked', { date_of_service: '2026-01-01', submitted_date: '2026-01-02', last_activity: '2026-02-25' }),
    row('young', { date_of_service: '2026-02-10', submitted_date: '2026-02-11' }),
  ]);
  assert.equal(by.quiet.flag, 'follow_up');
  assert.match(by.quiet.next_step, /58 days after submission and no activity since 2026-01-20/);
  assert.equal(by.worked.flag, 'waiting');
  assert.equal(by.young.flag, 'waiting');
});

test('a small claim about to miss its filing limit outranks a larger claim that is only waiting', () => {
  const { r } = run([row('big', { balance: 900, date_of_service: '2026-02-20', submitted_date: '2026-02-21' }), row('due', { balance: 150, date_of_service: '2025-12-20' })]);
  assert.equal(r.items[0].claim_id, 'due');
  assert.equal(r.at_risk_balance, 150);
  assert.deepEqual(r.by_flag, { waiting: 1, file_now: 1 });
});

test('payers with no limit are listed, rows with no dates go to the unknown bucket, credits are skipped', () => {
  const { r, by } = run([row('N', { payer: 'Sample Mutual', date_of_service: '', submitted_date: '' }), row('Z', { balance: 0 }), row('C', { balance: '-25.00' })], { payers: [] });
  assert.equal(r.claims_open, 1);
  assert.equal(by.N.bucket, 'unknown');
  assert.deepEqual(r.payers_without_limit, ['Sample Mutual']);
  assert.equal(r.aging_by_payer['Sample Mutual'].unknown, 100);
});
