// Domain checks for appointments against 271 responses (ver 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAppointments, benefitsSummary } from '../src/logic.js';

const member = (o = {}) => ({ trace: o.trace || null, member_id: o.member_id || 'EHP1', payer: 'Example Health Plan', active: true, plan_begin: '2026-01-01', plan_end: null, rejections: [], benefits: [], other_payers: [], ...o });
const appt = (o = {}) => ({ appointment_id: 'V1', date: '2026-03-02', patient_name: 'Pat Example', member_id: 'EHP1', payer: 'Example Health Plan', type: 'Follow-up', ...o });
const b = (code, o = {}) => ({ code, service_types: [], in_network: 'Y', amount: null, percent: null, period: null, ...o });

test('money facts: in-network copay first, coinsurance as a percent, deductible and what is left of it', () => {
  const s = benefitsSummary(member({ benefits: [b('B', { in_network: 'N', amount: 60, service_types: ['98'] }), b('B', { amount: 25, service_types: ['98'] }), b('A', { percent: 0.2 }), b('C', { amount: 1500, period: '23' }), b('C', { amount: 400, period: '29' }), b('G', { amount: 2100, period: '29' }), b('B', { amount: 300, service_types: ['47'] })] }));
  assert.deepEqual(s, { copay: 25, coinsurance_percent: 20, deductible: 1500, deductible_remaining: 400, out_of_pocket_remaining: 2100, in_network: 'Y' });
});

test('cancelled and no-show visits are skipped; a visit with no 271 needs an inquiry', () => {
  const r = checkAppointments([appt({ status: 'Cancelled' }), appt({ appointment_id: 'V2', status: 'No Show' }), appt({ appointment_id: 'V3', member_id: 'ZZZ' })], [member()]);
  assert.equal(r.appointments, 1); assert.equal(r.rows[0].status, 'no_response'); assert.match(r.rows[0].fix, /send \(or resend\)/);
});

test('a plan ending the day before the visit has ended; ending on the visit day is still active', () => {
  assert.equal(checkAppointments([appt()], [member({ plan_end: '2026-03-01' })]).rows[0].status, 'plan_ended');
  assert.equal(checkAppointments([appt()], [member({ plan_end: '2026-03-02' })]).rows[0].status, 'active');
  assert.equal(checkAppointments([appt()], [member({ active: false, plan_end: '2026-02-28' })]).rows[0].reasons[0], 'The 271 says coverage is inactive (plan ended 2026-02-28).');
});

test('another payer on file means coordination of benefits, with the payer named', () => {
  const r = checkAppointments([appt()], [member({ other_payers: [{ name: 'Demo Medicare Plan' }] })]).rows[0];
  assert.equal(r.status, 'other_payer'); assert.match(r.reasons[0], /Demo Medicare Plan/); assert.match(r.fix, /bill the primary first/);
  assert.match(checkAppointments([appt()], [member({ benefits: [b('R')] })]).rows[0].reasons[0], /EB\*R/);
});

test('a primary care provider on the plan adds a referral note but keeps the visit ready', () => {
  const r = checkAppointments([appt()], [member({ benefits: [b('L'), b('1')] })]);
  assert.equal(r.rows[0].status, 'active'); assert.match(r.rows[0].reasons[0], /referral/); assert.equal(r.ready, 1);
});

test('rejections are explained; an unknown AAA code points to the code list', () => {
  const r = checkAppointments([appt()], [member({ rejections: [{ code: '75' }, { code: '99' }] })]).rows[0];
  assert.equal(r.status, 'not_found');
  assert.deepEqual(r.reasons, ['AAA 75: Subscriber not found', 'AAA 99: see the X12 code list']);
});

test('worst first, then by date; copays to collect add up only for ready visits', () => {
  const ms = [member({ member_id: 'A', benefits: [b('1'), b('B', { amount: 30 })] }), member({ member_id: 'B', benefits: [b('1'), b('B', { amount: 45.5 })] }), member({ member_id: 'C', active: false, benefits: [b('B', { amount: 99 })] })];
  const r = checkAppointments([appt({ appointment_id: 'V1', member_id: 'A', date: '2026-03-03' }), appt({ appointment_id: 'V2', member_id: 'B', date: '2026-03-02' }), appt({ appointment_id: 'V3', member_id: 'C' })], ms);
  assert.deepEqual(r.rows.map((x) => x.appointment_id), ['V3', 'V2', 'V1']);
  assert.equal(r.copay_to_collect, 75.5); assert.deepEqual(r.by_status, { active: 2, inactive: 1 });
});
