// Fairclaim Eligibility Checks logic: appointments checked against 271 eligibility responses. No I/O.
import { str, isoDate, payerKey } from 'fairclaim-core';

/** AAA03 reject reasons on a 271, paraphrased. */
export const AAA_REASONS = Object.freeze({ 15: 'Required data missing in the request', 41: 'Authorization or access restriction', 42: 'Payer cannot respond right now: try again later', 43: 'Provider id invalid or missing', 45: 'Provider specialty invalid or missing', 47: 'Provider state invalid or missing', 48: 'Referring provider id invalid or missing', 49: 'Provider is not the primary care physician', 51: 'Provider not on file', 52: 'Service dates not within the provider\'s plan enrolment', 56: 'Inappropriate date', 57: 'Service dates invalid or missing', 58: 'Birth date invalid or missing', 60: 'Birth date is after the service date', 61: 'Date of death is before the service date', 62: 'Service date outside the inquiry period', 63: 'Service date is in the future', 64: 'Patient id invalid or missing', 65: 'Patient name invalid or missing', 66: 'Patient gender invalid or missing', 67: 'Patient not found', 68: 'Duplicate patient id', 71: 'Birth date does not match the payer\'s record', 72: 'Subscriber id invalid or missing', 73: 'Subscriber name invalid or missing', 74: 'Subscriber gender invalid or missing', 75: 'Subscriber not found', 76: 'Duplicate subscriber id', 78: 'Subscriber not in the group or plan named', 79: 'Participant identification invalid' });
const FIX = { inactive: 'Coverage is not active on the visit date: ask the patient for current insurance before the visit, or set up self-pay.', not_found: 'The payer could not find the member: check the member id, name and birth date against the card and send the inquiry again.', plan_ended: 'The plan ends before the visit: ask the patient for the new plan.', other_payer: 'Another payer is primary: confirm the order of benefits and bill the primary first.', no_response: 'No 271 for this visit: send (or resend) the eligibility inquiry.', retry: 'The payer could not answer: send the inquiry again later.', review: 'Check this visit before it happens.' };

const norm = (v) => str(v).toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Money facts from EB segments: copay, coinsurance, deductible (total and remaining), out-of-pocket remaining, in network first. */
export function benefitsSummary(m) {
  const pick = (code, pred = () => true) => (m.benefits || []).filter((b) => b.code === code && pred(b)).sort((a, b) => (b.in_network === 'Y') - (a.in_network === 'Y'));
  const officeOrAll = (b) => !b.service_types.length || b.service_types.some((t) => ['30', '98', 'BZ', 'A3'].includes(t));
  const copay = pick('B', officeOrAll)[0];
  const coins = pick('A', officeOrAll)[0];
  const ded = pick('C', (b) => b.period !== '29')[0]; const dedLeft = pick('C', (b) => b.period === '29')[0];
  const oopLeft = pick('G', (b) => b.period === '29')[0];
  return { copay: copay ? copay.amount : null, coinsurance_percent: coins && coins.percent !== null ? Math.round(coins.percent * 100) : null, deductible: ded ? ded.amount : null, deductible_remaining: dedLeft ? dedLeft.amount : null, out_of_pocket_remaining: oopLeft ? oopLeft.amount : null, in_network: copay ? copay.in_network : null };
}

/**
 * appointments: APPOINTMENT_FIELDS rows; members: read271 members (any number of 271 files).
 * facts: accepted visit_type_review facts { payer, visit_type, note }.
 */
export function checkAppointments(appointments, members, { facts = [], skipStatuses = ['cancelled', 'canceled', 'no show', 'no-show'] } = {}) {
  const byTrace = new Map(); const byMember = new Map();
  for (const m of members) { if (m.trace) byTrace.set(norm(m.trace), m); if (m.member_id) byMember.set(norm(m.member_id), m); }
  const rows = [];
  for (const a of appointments) {
    if (skipStatuses.includes(str(a.status).toLowerCase())) continue;
    const date = isoDate(a.date);
    const m = byTrace.get(norm(a.appointment_id)) || (a.member_id ? byMember.get(norm(a.member_id)) : null) || null;
    const r = { appointment_id: str(a.appointment_id), date, patient_name: str(a.patient_name) || null, member_id: str(a.member_id) || null, payer: str(a.payer) || (m && m.payer) || null, provider: str(a.provider) || null, type: str(a.type) || null, status: null, reasons: [], fix: null, matched_by: m ? (byTrace.get(norm(a.appointment_id)) === m ? 'trace' : 'member_id') : null, plan_begin: m ? m.plan_begin : null, plan_end: m ? m.plan_end : null, ...(m ? benefitsSummary(m) : { copay: null, coinsurance_percent: null, deductible: null, deductible_remaining: null, out_of_pocket_remaining: null, in_network: null }) };
    if (!m) r.status = 'no_response';
    else if (m.rejections.length) { const codes = m.rejections.map((x) => x.code); r.reasons = codes.map((c) => `AAA ${c}: ${AAA_REASONS[c] || 'see the X12 code list'}`); r.status = codes.some((c) => c === '42') ? 'retry' : 'not_found'; }
    else if (m.active === false) { r.status = 'inactive'; r.reasons.push(`The 271 says coverage is inactive${m.plan_end ? ` (plan ended ${m.plan_end})` : ''}.`); }
    else if (m.plan_end && date && m.plan_end < date) { r.status = 'plan_ended'; r.reasons.push(`Plan ends ${m.plan_end}, visit is ${date}.`); }
    else if (m.plan_begin && date && m.plan_begin > date) { r.status = 'inactive'; r.reasons.push(`Plan starts ${m.plan_begin}, after the visit.`); }
    else if (m.benefits.some((b) => b.code === 'R') || m.other_payers.length) { r.status = 'other_payer'; r.reasons.push(`Other payer on file: ${m.other_payers.map((p) => p.name).filter(Boolean).join(', ') || 'named in an EB*R segment'}.`); }
    else if (m.active) r.status = 'active';
    else { r.status = 'review'; r.reasons.push('The 271 has no active or inactive benefit.'); }
    if (r.status === 'active' || r.status === 'other_payer') {
      const pcp = m.benefits.find((b) => b.code === 'L');
      if (pcp) r.reasons.push('The plan lists a primary care provider: a specialist visit may need a referral.');
      for (const f of facts) {
        const v = f.value || {};
        if (payerKey(v.payer) === payerKey(r.payer) && (!v.visit_type || str(r.type).toLowerCase().includes(str(v.visit_type).toLowerCase()))) { r.status = r.status === 'active' ? 'review' : r.status; r.reasons.push(v.note || `Your team asked to review ${v.visit_type || 'visits'} for ${v.payer}.`); r.fact_id = f.id; }
      }
    }
    r.fix = r.status === 'active' ? null : FIX[r.status] || FIX.review;
    rows.push(r);
  }
  const by = rows.reduce((m, r) => { m[r.status] = (m[r.status] || 0) + 1; return m; }, {});
  const order = { not_found: 0, inactive: 1, plan_ended: 2, other_payer: 3, no_response: 4, retry: 5, review: 6, active: 7 };
  return { appointments: rows.length, ready: by.active || 0, need_action: rows.length - (by.active || 0), by_status: by, copay_to_collect: Math.round(rows.filter((r) => r.status === 'active' && r.copay).reduce((s, r) => s + r.copay, 0) * 100) / 100, rows: rows.sort((x, y) => order[x.status] - order[y.status] || String(x.date).localeCompare(String(y.date))) };
}
