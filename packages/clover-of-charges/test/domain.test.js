// Domain checks for charge capture, charge lag and the E/M level mix (ver 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileCharges, emMix } from '../src/logic.js';

const claim = (id, name, date, codes, o = {}) => ({ claim_id: id, patient_name: name, provider: o.provider || 'Dr A', submitted_date: o.submitted === undefined ? date : o.submitted, lines: codes.map((c) => ({ code: c, charge: o.charge ?? 100, date_from: date })) });
const appt = (id, name, date, status, o = {}) => ({ appointment_id: id, patient_name: name, date, status, provider: 'Dr A', ...o });
const rowOf = (r, id) => r.rows.find((x) => x.appointment_id === id || x.claim_id === id);

test('a completed visit with no charge is pending inside the lag window and missing after it', () => {
  const r = reconcileCharges([appt('new', 'Pat Example', '2026-02-09', 'Checked out'), appt('old', 'Sam Example', '2026-02-01', 'Completed')], [], { asOf: '2026-02-10', config: { lag_days: 3 } });
  assert.equal(rowOf(r, 'new').status, 'pending');
  assert.equal(rowOf(r, 'old').status, 'missing_charge');
  assert.match(rowOf(r, 'old').message, /9 day\(s\) ago/);
  assert.equal(r.need_action, 1, 'pending is not counted as needing action');
});

test('"Not seen" and "left without being seen" are cancellations, and "not checked in" is still scheduled', () => {
  const r = reconcileCharges([
    appt('ns', 'Pat Example', '2026-02-02', 'Not seen'),
    appt('lw', 'Sam Example', '2026-02-02', 'Left without being seen'),
    appt('nc', 'Lee Example', '2026-02-02', 'Not checked in'),
    appt('lc', 'Kim Example', '2026-02-02', 'LWBS'),
  ], [claim('C9', 'Kim Example', '2026-02-02', ['99213'])], { asOf: '2026-02-12' });
  assert.equal(r.rows.length, 1, 'only the LWBS visit with a charge is reported');
  assert.equal(rowOf(r, 'lc').status, 'charge_on_cancelled');
});

test('a charge is linked by its claim id first, then the appointment id, then patient and date', () => {
  const r = reconcileCharges([appt('A1', 'Pat Example', '2026-02-03', 'Completed', { claim_id: 'C2' }), appt('C3', 'Nobody Here', '2026-02-03', 'Completed'), appt('A4', 'PAT  example', '2026-02-03', 'Completed')],
    [claim('C1', 'Pat Example', '2026-02-03', ['99213']), claim('C2', 'Pat Example', '2026-02-03', ['99214']), claim('C3', 'Someone Else', '2026-02-03', ['99212'])], { asOf: '2026-02-04' });
  assert.deepEqual(['A1', 'C3', 'A4'].map((id) => r.rows.find((x) => x.appointment_id === id).claim_id), ['C2', 'C3', 'C1']);
  assert.equal(r.by_status.charge_without_visit, undefined);
});

test('a charge with no visit on the schedule is reported with its date', () => {
  const r = reconcileCharges([], [claim('W1', 'Pat Example', '2026-02-05', ['99203'])], { asOf: '2026-02-10' });
  assert.deepEqual([r.rows[0].status, r.rows[0].date, r.visits, r.charges_checked], ['charge_without_visit', '2026-02-05', 0, 1]);
});

test('late entry uses the submission date; the median lag is the lower middle value', () => {
  const r = reconcileCharges([appt('a', 'P1', '2026-02-01', 'Completed'), appt('b', 'P2', '2026-02-01', 'Completed'), appt('c', 'P3', '2026-02-01', 'Completed'), appt('d', 'P4', '2026-02-01', 'Completed')],
    [claim('1', 'P1', '2026-02-01', ['99213'], { submitted: '2026-02-02' }), claim('2', 'P2', '2026-02-01', ['99213'], { submitted: '2026-02-03' }), claim('3', 'P3', '2026-02-01', ['99213'], { submitted: '2026-02-09' }), claim('4', 'P4', '2026-02-01', ['99213'], { submitted: '2026-02-11' })], { asOf: '2026-02-12', config: { lag_days: 3 } });
  assert.deepEqual(['a', 'b', 'c', 'd'].map((id) => rowOf(r, id).status), ['matched', 'matched', 'late_entry', 'late_entry']);
  assert.equal(r.median_entry_lag, 2);
});

test('expected codes: a prefix pattern satisfies the rule, and a rule with no codes is ignored instead of failing', () => {
  const config = { expected: [{ visit_type: 'injection', codes: ['J*', '96372'] }, { visit_type: 'procedure' }] };
  const r = reconcileCharges([appt('i1', 'P1', '2026-02-01', 'Completed', { type: 'Knee injection' }), appt('i2', 'P2', '2026-02-01', 'Completed', { type: 'Injection visit' }), appt('p1', 'P3', '2026-02-01', 'Completed', { type: 'Procedure' })],
    [claim('1', 'P1', '2026-02-01', ['20610', 'J3301']), claim('2', 'P2', '2026-02-01', ['20610']), claim('3', 'P3', '2026-02-01', ['11042'])], { asOf: '2026-02-02', config });
  assert.equal(rowOf(r, 'i1').status, 'matched');
  assert.equal(rowOf(r, 'i2').status, 'expected_code_missing');
  assert.match(rowOf(r, 'i2').message, /J\* or 96372; the charge has 20610/);
  assert.equal(rowOf(r, 'p1').status, 'matched');
});

test('E/M mix counts only current new and established codes, compares with peers and never calls a difference an error', () => {
  const lines = (p, codes) => claim(p + codes.join(''), 'x', '2026-02-01', codes, { provider: p });
  const m = emMix([lines('Dr High', ['99214', '99215', '99215', '99204', '99214', '99201', '99283']), lines('Dr Mid', ['99213', '99213', '99212', '99214', '99213', '99203'])]);
  const hi = m.find((p) => p.provider === 'Dr High'), mid = m.find((p) => p.provider === 'Dr Mid');
  assert.equal(hi.em_lines, 5, '99201 (deleted) and ED codes are left out');
  assert.equal(hi.level_4_5_share, 100);
  assert.equal(hi.differs, true);
  assert.match(hi.note, /not an error by itself/);
  assert.equal(mid.peer_share, 100);
});
