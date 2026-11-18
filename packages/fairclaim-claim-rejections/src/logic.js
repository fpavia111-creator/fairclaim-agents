// Fairclaim Claim Rejections logic: 999 and 277CA acknowledgements tied back to the claims sent. No I/O.
// Code meanings are short paraphrases of the X12 code lists, for staff; the code itself is always shown.
import { str, payerKey } from 'fairclaim-core';

export const IK3_CODES = Object.freeze({ 1: 'Segment id not recognised', 2: 'Segment not expected here', 3: 'Required segment missing', 4: 'Loop repeats too many times', 5: 'Segment repeats too many times', 6: 'Segment not in this transaction', 7: 'Segment out of order', 8: 'Segment has element errors', I4: 'Segment the guide says is not used', I6: 'Segment the guide requires in this situation is missing', I7: 'Loop occurs fewer times than required', I8: 'Segment occurs fewer times than required', I9: 'Situational segment present when it should not be' });
export const IK4_CODES = Object.freeze({ 1: 'Required element missing', 2: 'Conditionally required element missing', 3: 'Too many elements', 4: 'Value too short', 5: 'Value too long', 6: 'Invalid character', 7: 'Invalid code value', 8: 'Invalid date', 9: 'Invalid time', 10: 'Element present when it must not be', 12: 'Too many repetitions', 13: 'Too many components', I10: 'Element the guide says is not used', I11: 'Too few repetitions', I12: 'Value does not match the pattern the guide requires', I13: 'Situational element present when it should not be', I6: 'Code value the guide does not use', I9: 'Situational element missing' });
/** Common claim status codes (STC01-2) seen on front-end rejections. */
export const STATUS_CODES = Object.freeze({ 0: 'Cannot provide further status electronically', 19: 'Entity acknowledges receipt of claim', 20: 'Accepted for processing', 21: 'Missing or invalid information', 33: 'Subscriber and subscriber id not found', 35: 'Claim or encounter not found', 116: 'Claim submitted to the wrong payer', 145: 'Entity\'s name', 153: 'Entity\'s id number', 164: 'Entity\'s contract or member number', 187: 'Date(s) of service', 188: 'Statement date', 189: 'Facility type code', 400: 'Claim is out of balance', 454: 'Procedure code for services rendered', 455: 'Revenue code for services rendered', 510: 'Future date', 562: 'Entity\'s National Provider Identifier (NPI)', 564: 'Entity\'s claim filing indicator', 586: 'Service line billed amount', 673: 'Patient control number', 744: 'Does the claim contain a valid diagnosis code pointer', 747: 'Missing or invalid diagnosis code', 748: 'Service line date of service', 732: 'Information submitted inconsistent with billing guidelines' });
export const ENTITY_CODES = Object.freeze({ 40: 'receiver', 41: 'submitter', 82: 'rendering provider', 85: 'billing provider', 87: 'pay-to provider', DN: 'referring provider', IL: 'subscriber', PR: 'payer', QC: 'patient', 77: 'service location', DK: 'ordering provider' });

const CATEGORY_FIX = { A3: 'The claim was returned as unprocessable: correct it and send it as a new original claim (frequency 1).', A4: 'The payer cannot find the claim or member: check the payer id and member id, then resend.', A6: 'Information is missing: add it and resend as a new original claim.', A7: 'Information is invalid: correct the value and resend as a new original claim.', A8: 'Two values contradict each other (for example dates or codes): correct them and resend.' };

/** Which claim a 999 segment position belongs to: inside a claim's loop, or the billing-provider header (all claims). */
export function claimAt(claims, control, position) {
  const list = claims.filter((c) => c.transaction_control === control).sort((a, b) => a.loop_start - b.loop_start);
  if (!list.length || position === null) return { scope: 'unknown', claims: list };
  const hit = list.find((c) => position >= c.loop_start && position <= c.segments[1]);
  if (hit) return { scope: 'claim', claims: [hit] };
  if (position < list[0].loop_start) return { scope: 'billing_provider', claims: list };
  return { scope: 'trailer', claims: list };
}

/**
 * Build the rejection work list.
 * acks: readHealthcareX12 results; claims: the 837 claims sent (optional); facts: accepted rejection_fix facts.
 */
export function rejections({ acks = [], claims = [], facts = [] }) {
  const items = []; const sets = []; const acked = new Set(); let resolved = 0;
  // A rejection followed by a later 277CA acceptance of the same claim (it was corrected and resent) is no longer work.
  const acceptedOn = new Map();
  for (const a of acks) for (const t of a.by_set['277'] || []) for (const c of t.claims) if (!c.rejected && c.date) { const d = acceptedOn.get(c.claim_id); if (!d || c.date > d) acceptedOn.set(c.claim_id, c.date); }
  const fixFor = (status, entity, payer) => facts.find((f) => str(f.value.status_code) === str(status) && (!f.value.entity || f.value.entity === entity) && (!f.value.payer || payerKey(f.value.payer) === payerKey(payer)));
  for (const a of acks) {
    for (const t of a.by_set['999'] || []) for (const s of t.sets) {
      sets.push({ set: s.set, control: s.control, status: s.status, status_code: s.status_code, errors: s.errors.length });
      for (const e of s.errors) {
        const at = s.set === '837' ? claimAt(claims, s.control, e.position) : { scope: 'unknown', claims: [] };
        const els = e.elements.map((x) => `${e.segment_id || 'segment'}${x.position ? `-${x.position}` : ''}: ${IK4_CODES[x.code] || `code ${x.code}`}${x.bad_value ? ` ("${x.bad_value}")` : ''}`);
        const text = `${e.segment_id ? `${e.segment_id} at segment ${e.position}${e.loop ? ` (loop ${e.loop})` : ''}: ${IK3_CODES[e.code] || `code ${e.code}`}` : 'Element error'}${els.length ? `. ${els.join('; ')}` : ''}.`;
        const cls = at.claims.length ? at.claims : [null];
        for (const c of cls) items.push({ source: '999', claim_id: c ? c.claim_id : null, patient_name: c ? c.patient_name : null, member_id: c ? c.member_id : null, payer: c ? c.payer_name : null, charge: c ? c.total_charge : null, transaction: s.control, set_status: s.status, scope: at.scope, segment: e.segment_id, position: e.position, loop: e.loop, codes: [e.code, ...e.elements.map((x) => x.code)].filter(Boolean), message: text, fix: s.accepted ? 'Accepted with errors: the claim went on, but fix the source so the next one is clean.' : `The whole transaction ${s.control} was rejected${at.scope === 'billing_provider' ? ' because of the billing-provider loop: every claim in it must be resent' : ''}. Fix the value in the billing system and resend.`, severity: s.accepted ? 'warning' : 'error' });
      }
      if (!s.accepted && !s.errors.length) items.push({ source: '999', claim_id: null, transaction: s.control, set_status: s.status, scope: 'transaction', codes: s.reason_codes || [], message: `Transaction ${s.control} rejected with no segment detail (IK5 ${s.status_code}${(s.reason_codes || []).length ? ` ${s.reason_codes.join(' ')}` : ''}).`, fix: 'Ask the clearinghouse for the detail, then resend.', severity: 'error' });
    }
    for (const t of a.by_set['277'] || []) for (const c of t.claims) {
      acked.add(c.claim_id);
      if (!c.rejected) continue;
      if (c.date && acceptedOn.get(c.claim_id) && acceptedOn.get(c.claim_id) >= c.date) { resolved++; continue; }
      const sent = claims.find((x) => x.claim_id === c.claim_id);
      const reasons = c.statuses.filter((x) => ['A3', 'A4', 'A6', 'A7', 'A8'].includes(x.category));
      const learned = reasons.map((x) => fixFor(x.status, x.entity, c.payer)).find(Boolean);
      items.push({ source: '277CA', claim_id: c.claim_id, patient_name: c.patient_name, member_id: c.member_id, payer: c.payer, charge: c.charge ?? (sent ? sent.total_charge : null), transaction: null, set_status: 'rejected', scope: 'claim', category: c.category, codes: reasons.map((x) => `${x.category}:${x.status}${x.entity ? `:${x.entity}` : ''}`), message: reasons.map((x) => `${x.category} ${x.meaning || ''}: ${STATUS_CODES[x.status] || `status ${x.status}`}${x.entity ? ` (${ENTITY_CODES[x.entity] || x.entity})` : ''}`).join('; ') + '.', fix: learned ? learned.value.fix : CATEGORY_FIX[c.category] || 'Correct and resend as a new original claim.', ...(learned ? { fact_id: learned.id } : {}), severity: 'error', date: c.date });
    }
  }
  const has277 = acks.some((a) => (a.by_set['277'] || []).length);
  const rejectedTx = new Set(sets.filter((x) => x.set === '837' && x.status === 'rejected').map((x) => x.control));
  const missing = has277 ? claims.filter((c) => !acked.has(c.claim_id) && !rejectedTx.has(c.transaction_control)).map((c) => ({ source: 'none', claim_id: c.claim_id, patient_name: c.patient_name, member_id: c.member_id, payer: c.payer_name, charge: c.total_charge, scope: 'claim', codes: [], message: 'No 277CA line for this claim.', fix: 'If the clearinghouse accepted the file more than two business days ago, ask whether the payer received it.', severity: 'warning' })) : [];
  const all = [...items, ...missing];
  const rejectedClaims = new Set(all.filter((i) => i.severity === 'error' && i.claim_id).map((i) => i.claim_id));
  return {
    transactions: sets.length, transactions_rejected: sets.filter((s) => s.status === 'rejected').length,
    claims_sent: claims.length, claims_rejected: rejectedClaims.size,
    charges_rejected: Math.round([...rejectedClaims].reduce((s, id) => s + ((claims.find((c) => c.claim_id === id) || all.find((i) => i.claim_id === id) || {}).total_charge ?? (all.find((i) => i.claim_id === id) || {}).charge ?? 0), 0) * 100) / 100,
    not_acknowledged: missing.length, resolved_by_later_acceptance: resolved,
    by_source: all.reduce((m, i) => { m[i.source] = (m[i.source] || 0) + 1; return m; }, {}),
    sets, items: all,
  };
}
