// Domain checks for anesthesia units, times, modifiers and payment (ver 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAnesthesia, anesthesiaClaims, toMinutes } from '../src/logic.js';

const base = new Map([['00790', 7], ['00840', 6]]);
const c = (id, prov, mods, start, end, o = {}) => ({ claim_id: id, case_id: o.case || id, patient_name: 'A', member_id: o.member || id, patient_dob: o.dob || '1980-01-01', payer: o.payer || 'P', provider: prov, date: '2026-02-03', code: o.code === undefined ? '00790' : o.code, modifiers: mods, start: toMinutes(start, '2026-02-03'), end: toMinutes(end, '2026-02-03'), start_raw: start, end_raw: end, minutes_reported: o.minutes ?? null, units_reported: o.units ?? null, charge: 0, qc: o.qc || [], other: o.other || [] });
const cfg = { payers: [{ name: 'P', conversion_factor: 20, ps_qc_units: true }] };
const item = (r, id) => r.items.find((i) => i.claim_id === id);

test('a directed case pays each side half: QY with QX, QK with QX; AA and QZ pay in full', () => {
  const r = checkAnesthesia([c('D1', 'Dr A', ['QY', 'P1'], '08:00', '09:00', { case: 'K1' }), c('D2', 'CRNA B', ['QX', 'P1'], '08:00', '09:00', { case: 'K1' }), c('S1', 'Dr C', ['AA', 'P1'], '08:00', '09:00'), c('S2', 'CRNA D', ['QZ', 'P1'], '08:00', '09:00')], base, { config: cfg });
  assert.deepEqual(['D1', 'D2', 'S1', 'S2'].map((id) => item(r, id).expected_allowed), [110, 110, 220, 220]);
});

test('a case that crosses midnight counts the minutes past midnight', () => {
  const r = checkAnesthesia([c('N1', 'Dr A', ['AA', 'P1'], '23:30', '01:00', { minutes: 90 })], base, { config: cfg });
  assert.deepEqual([item(r, 'N1').minutes, item(r, 'N1').time_units, item(r, 'N1').status], [90, 6, 'ok']);
});

test('reported minutes that disagree with the clock by more than a minute are an error', () => {
  const r = checkAnesthesia([c('T1', 'Dr A', ['AA', 'P1'], '08:00', '09:00', { minutes: 75 }), c('T2', 'Dr A', ['AA', 'P1'], '10:00', '11:00', { minutes: 61 })], base);
  assert.match(item(r, 'T1').issues[0].message, /Reported 75 minutes, but 08:00 to 09:00 is 60/);
  assert.equal(item(r, 'T2').status, 'ok');
});

test('physical status and qualifying circumstances add units only for payers that pay them', () => {
  const rows = [c('Q1', 'Dr A', ['AA', 'P3'], '08:00', '09:00', { qc: ['99140'] })];
  assert.deepEqual([item(checkAnesthesia(rows, base, { config: cfg }), 'Q1').units, item(checkAnesthesia(rows, base), 'Q1').units], [14, 11]);
});

test('99100 is for patients under 1 or over 70', () => {
  const r = checkAnesthesia([c('A1', 'Dr A', ['AA', 'P1'], '08:00', '09:00', { qc: ['99100'], dob: '1976-01-01' }), c('A2', 'Dr C', ['AA', 'P1'], '08:00', '09:00', { qc: ['99100'], dob: '1950-01-01' })], base);
  assert.match(item(r, 'A1').issues[0].message, /this patient is 50/); assert.equal(item(r, 'A2').status, 'ok');
});

test('pricing modifiers: none, or two at once, is an error; a missing physical status is a warning', () => {
  const r = checkAnesthesia([c('P1', 'Dr A', ['P1'], '08:00', '09:00'), c('P2', 'Dr C', ['AA', 'QZ', 'P1'], '08:00', '09:00'), c('P3', 'Dr E', ['AA'], '08:00', '09:00')], base);
  assert.equal(item(r, 'P1').issues[0].check, 'pricing_modifier'); assert.match(item(r, 'P2').issues.find((i) => i.check === 'pricing_modifier').message, /AA, QZ/);
  assert.deepEqual([item(r, 'P3').status, item(r, 'P3').issues[0].check], ['warning', 'physical_status']);
});

test('a CRNA cannot bill two overlapping cases; a claim with no anesthesia code says what it found', () => {
  const r = checkAnesthesia([c('C1', 'CRNA B', ['QZ', 'P1'], '08:00', '09:30'), c('C2', 'CRNA B', ['QZ', 'P1'], '09:00', '10:00'), c('Z1', 'Dr A', ['AA'], '08:00', '09:00', { code: null, other: ['99213'] })], base);
  assert.ok(item(r, 'C1').issues.some((i) => i.check === 'overlap' && /C2/.test(i.message)));
  assert.match(item(r, 'Z1').issues[0].message, /found 99213/);
});

test('rows group into one case per claim, with qualifying lines attached and charges summed', () => {
  const cases = anesthesiaClaims([{ claim_id: 'A', code: '00790', modifiers: 'QK P3', start_time: '0800', end_time: '0930', date_of_service: '2026-02-03', charge: '900' }, { claim_id: 'A', code: '99140', charge: '100' }, { claim_id: 'A', code: '64447', charge: '200' }]);
  assert.equal(cases.length, 1);
  assert.deepEqual([cases[0].qc, cases[0].other, cases[0].charge, cases[0].end - cases[0].start], [['99140'], ['64447'], 1200, 90]);
});
