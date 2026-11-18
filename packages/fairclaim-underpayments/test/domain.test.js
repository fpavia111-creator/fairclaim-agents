// Domain checks for expected allowed amounts against the contract (ver 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkLines } from '../src/logic.js';

const claims = (lines, payer = 'Example Health Plan') => [{ claim_id: 'C1', payer, patient_name: 'Pat Example', lines: lines.map((l, i) => ({ line: i + 1, modifiers: [], units: 1, adjustments: [], allowed: null, charge: 200, date_from: '2026-01-10', ...l })) }];
const pr = (amount) => [{ group: 'PR', reason: '2', amount }];
const terms = (o) => ({ payers: [{ name: 'Example Health Plan', ...o }] });

test('allowed is paid plus the patient share when the remittance has no AMT*B6', () => {
  const r = checkLines(claims([{ code: '99213', paid: 70, adjustments: pr(20) }]), { config: terms({ method: 'fee_schedule' }), fees: [{ code: '99213', fee: 100 }] });
  const l = r.lines[0];
  assert.deepEqual([l.allowed, l.allowed_source, l.expected, l.status, l.variance], [90, 'paid + patient share', 100, 'underpaid', -10]);
  assert.equal(r.underpaid_amount, 10);
});

test('percent of Medicare and percent of charge, multiplied by the units', () => {
  const med = checkLines(claims([{ code: '97110', units: 3, paid: 100, allowed: 99 }]), { config: terms({ method: 'percent_of_medicare', percent: 110 }), medicare: [{ code: '97110', fee: 30 }] });
  assert.deepEqual([med.lines[0].expected, med.lines[0].status], [99, 'as_contracted']);
  const chg = checkLines(claims([{ code: '99213', units: 2, charge: 300, paid: 150, allowed: 150 }]), { config: terms({ method: 'percent_of_charge', percent: 60 }) });
  assert.deepEqual([chg.lines[0].expected, chg.lines[0].status], [180, 'underpaid']);
});

test('a misspelt method or a missing percent prices nothing instead of expecting 0 and calling every line overpaid', () => {
  const a = checkLines(claims([{ code: '99213', paid: 90, allowed: 90 }]), { config: terms({ method: 'fee schedule' }), fees: [{ code: '99213', fee: 100 }] });
  assert.deepEqual([a.lines[0].status, a.overpaid_lines], ['no_contract', 0]);
  assert.match(a.lines[0].notes[0], /is not one of fee_schedule, percent_of_medicare, percent_of_charge/);
  const b = checkLines(claims([{ code: '99213', paid: 90, allowed: 90 }]), { config: terms({ method: 'percent_of_medicare' }), medicare: [{ code: '99213', fee: 80 }] });
  assert.match(b.lines[0].notes[0], /has no percent/);
});

test('multiple procedures: the highest expected line at 100 percent, the others cut', () => {
  const config = { ...terms({ method: 'fee_schedule' }), mppr: { codes: ['1*'], percent_after_first: 50 } };
  const r = checkLines(claims([{ code: '11042', paid: 50, allowed: 50 }, { code: '17000', paid: 200, allowed: 200 }]), { config, fees: [{ code: '11042', fee: 100 }, { code: '17000', fee: 200 }] });
  const by = Object.fromEntries(r.lines.map((l) => [l.code, l]));
  assert.deepEqual([by['17000'].expected, by['11042'].expected, by['11042'].status], [200, 50, 'as_contracted']);
  assert.match(by['11042'].basis, /multiple procedure at 50%/);
});

test('a denied line and a code missing from the fee schedule are listed, not priced', () => {
  const r = checkLines(claims([{ code: '99213', paid: 0, adjustments: [{ group: 'CO', reason: '197', amount: 200 }] }, { code: '99999', paid: 40, allowed: 40 }]), { config: terms({ method: 'fee_schedule' }), fees: [{ code: '99213', fee: 100 }] });
  assert.deepEqual(r.lines.map((l) => l.status), ['denied', 'no_fee']);
  assert.deepEqual(r.missing_fees, ['Example Health Plan: 99999']);
  assert.equal(r.priced, 0);
});

test('a percent tolerance widens the band for large amounts; underpaid lines are grouped by payer', () => {
  const fees = [{ code: '27447', fee: 2000 }];
  const r = checkLines(claims([{ code: '27447', paid: 1985, allowed: 1985 }]), { config: { ...terms({ method: 'fee_schedule' }), tolerance: 0.5, tolerance_percent: 1 }, fees });
  assert.equal(r.lines[0].status, 'as_contracted');
  const s = checkLines(claims([{ code: '27447', paid: 1900, allowed: 1900 }]), { config: { ...terms({ method: 'fee_schedule' }), tolerance_percent: 1 }, fees });
  assert.deepEqual(s.by_payer, [{ payer: 'Example Health Plan', count: 1, amount: 100, claims: 1 }]);
});
