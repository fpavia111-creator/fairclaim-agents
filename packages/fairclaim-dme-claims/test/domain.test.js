// Domain checks for DMEPOS lines, rental months and orders (ver 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDme, rentalPeriods } from '../src/logic.js';

const claim = (id, code, mods, date, o = {}) => ({ claim_id: id, patient_name: 'Pat Example', member_id: o.member || 'M1', payer_name: 'Example Health Plan', service_from: date, prior_auth: o.pa || null, order_date: o.claimOrder || null, lines: [{ line: 1, code, modifiers: mods, units: o.units ?? 1, charge: 10, date_from: date, order_date: o.order || null, delivery_date: o.delivered || null }] });
const month = (i) => { const d = new Date(Date.UTC(2025, i, 1)); return d.toISOString().slice(0, 10); };
const hist = (code, date, mods = 'RR KJ', member = 'M1') => ({ member_id: member, date_of_service: date, code, modifiers: mods });

test('history months count toward the cap, and a history row for the same month as the claim is not counted twice', () => {
  const history = Array.from({ length: 12 }, (_, i) => hist('E0601', month(i), i === 0 ? 'RR KH' : i < 3 ? 'RR KI' : 'RR KJ'));
  history.push(hist('E0601', month(12)));
  const r = checkDme([claim('C13', 'E0601', ['RR', 'KJ'], month(12))], history);
  assert.equal(r.items[0].rental_month, 13);
  assert.equal(r.items[0].status, 'ok');
  assert.equal(r.rentals[0].status, 'capped_owned');
});

test('a gap longer than the gap window starts a new period at month 1, with a warning to document the break', () => {
  const r = checkDme([claim('N', 'E0570', ['RR', 'KH'], '2026-03-01')], [hist('E0570', '2025-11-01', 'RR KH'), hist('E0570', '2025-12-01', 'RR KI')], { config: { gap_days: 60 } });
  assert.equal(r.items[0].rental_month, 1);
  assert.deepEqual(r.items[0].issues.map((i) => i.check), ['gap']);
  assert.equal(rentalPeriods([{ rental: true, who: 'a', code: 'X', date: '2026-01-01' }, { rental: true, who: 'a', code: 'X', date: '2026-02-15' }], { gapDays: 60 }).length, 1);
});

test('oxygen rental past 36 months is a warning that the supplier must keep furnishing, not an error', () => {
  const history = Array.from({ length: 36 }, (_, i) => hist('E1390', month(i), 'RR'));
  const r = checkDme([claim('O', 'E1390', ['RR'], month(36))], history);
  assert.equal(r.items[0].rental_month, 37);
  assert.deepEqual([r.items[0].status, r.items[0].issues[0].check], ['warning', 'cap']);
  assert.match(r.items[0].issues[0].message, /must keep furnishing/);
});

test('power mobility needs a prior authorization and an order dated before delivery', () => {
  const r = checkDme([claim('PW', 'K0823', ['RR', 'KH'], '2026-02-10', { delivered: '2026-02-10', order: '2026-02-12' }), claim('OK', 'K0823', ['RR', 'KH'], '2026-02-10', { member: 'M2', pa: 'PA-1', delivered: '2026-02-10', claimOrder: '2026-02-01' })]);
  const pw = r.items.find((i) => i.claim_id === 'PW'), ok = r.items.find((i) => i.claim_id === 'OK');
  assert.deepEqual(pw.issues.map((i) => [i.check, i.severity]), [['prior_auth', 'error'], ['order', 'error']]);
  assert.equal(ok.status, 'ok', 'an order date on the claim header counts');
});

test('a purchase dated after delivery is a warning; a non-HCPCS code is an error; an unknown item asks for a table entry', () => {
  const r = checkDme([claim('P', 'E0114', ['NU'], '2026-02-12', { delivered: '2026-02-10' }), claim('X', '99213', [], '2026-02-12'), claim('U', 'E0999', ['NU'], '2026-02-12')]);
  const by = Object.fromEntries(r.items.map((i) => [i.claim_id, i.issues.map((x) => `${x.check}:${x.severity}`)]));
  assert.deepEqual(by.P, ['delivery:warning']);
  assert.deepEqual(by.X, ['code:error', 'unknown_item:info']);
  assert.deepEqual(by.U, ['unknown_item:info']);
});

test('supplies over the unit limit are a warning; the config item table extends the built-in one', () => {
  const r = checkDme([claim('S', 'A4253', [], '2026-02-01', { units: 9 }), claim('Z', 'A9999', [], '2026-02-01', { units: 3 })], [], { config: { items: [{ code: 'A9999', label: 'Example supply', category: 'supply', max_units: 2 }] } });
  assert.match(r.items.find((i) => i.claim_id === 'S').issues[0].message, /9 unit\(s\) of A4253 is over your limit of 6/);
  assert.equal(r.items.find((i) => i.claim_id === 'Z').item, 'Example supply');
  assert.equal(r.by_check.units, 2);
});

test('the rental list gives the next month and modifiers, and marks a rental with no recent month as stopped', () => {
  const r = checkDme([], [hist('E0601', '2026-01-01', 'RR KH'), hist('E0601', '2026-02-01', 'RR KI'), hist('E0260', '2025-09-01', 'RR KH', 'M2')], { asOf: '2026-02-20' });
  const cpap = r.rentals.find((x) => x.code === 'E0601'), bed = r.rentals.find((x) => x.code === 'E0260');
  assert.deepEqual([cpap.status, cpap.next_month, cpap.next_date, cpap.next_modifiers], ['renting', 3, '2026-03-01', 'RR KI']);
  assert.equal(bed.status, 'stopped');
});
