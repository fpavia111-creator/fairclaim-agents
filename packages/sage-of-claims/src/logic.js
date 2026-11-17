// Sage logic: claim scrubbing rules over claims in the read837 / groupClaims shape. No I/O.
import { str, round2, isoDate, daysBetween, npiProblem, icd10Valid, codeFamily, modifierValid, isEm, payerKey, POS, MODIFIERS } from 'remedy-core';

/** Every check Sage runs: id → { severity, field, fix }. */
export const CHECKS = Object.freeze({
  billing_npi: { severity: 'error', field: 'billing_npi', fix: 'Enter the billing provider\'s 10-digit NPI (loop 2010AA).' },
  rendering_npi: { severity: 'error', field: 'rendering_npi', fix: 'Correct the rendering provider\'s NPI (loop 2310B or 2420A).' },
  payer_id: { severity: 'error', field: 'payer_id', fix: 'Add the payer\'s electronic payer id from your clearinghouse list.' },
  member_id: { severity: 'error', field: 'member_id', fix: 'Copy the member id from the insurance card or the eligibility response.' },
  member_id_pattern: { severity: 'error', field: 'member_id', fix: 'The member id does not look like this payer\'s ids. Check the card for a prefix or a typo.' },
  patient_dob: { severity: 'error', field: 'patient_dob', fix: 'Enter the patient\'s date of birth; it must be before the date of service.' },
  future_service: { severity: 'error', field: 'date_of_service', fix: 'A service date is after the check date. Hold the claim until the service has happened.' },
  service_date_missing: { severity: 'error', field: 'date_of_service', fix: 'Every line needs a service date.' },
  total_mismatch: { severity: 'error', field: 'total_charge', fix: 'Make the claim total equal the sum of the line charges.' },
  zero_charge: { severity: 'warning', field: 'charge', fix: 'A line has no charge. Bill the practice\'s fee, or remove the line if it is informational.' },
  units: { severity: 'error', field: 'units', fix: 'Units must be a number above zero.' },
  units_high: { severity: 'warning', field: 'units', fix: 'Units are above the limit set in your config for this code. Check the documentation.' },
  code_format: { severity: 'error', field: 'code', fix: 'The procedure code is not a CPT, HCPCS or CDT code shape. Check for typos.' },
  modifier_format: { severity: 'error', field: 'modifiers', fix: 'Modifiers are two letters or digits.' },
  modifier_conflict: { severity: 'error', field: 'modifiers', fix: 'These modifiers cannot be on the same line. Keep the one the documentation supports.' },
  diagnosis_missing: { severity: 'error', field: 'diagnoses', fix: 'Add at least one ICD-10-CM diagnosis code.' },
  diagnosis_format: { severity: 'error', field: 'diagnoses', fix: 'This is not an ICD-10-CM code shape. Check for a typo or an ICD-9 code.' },
  pointer_missing: { severity: 'error', field: 'dx_pointer', fix: 'Point each line to the diagnosis it treats (1 to 4).' },
  pointer_range: { severity: 'error', field: 'dx_pointer', fix: 'The pointer refers to a diagnosis that is not on the claim.' },
  pos_missing: { severity: 'error', field: 'pos', fix: 'Add a two-digit place of service code.' },
  pos_unknown: { severity: 'warning', field: 'pos', fix: 'This place of service code is not in Sage\'s list. Check it against the CMS list.' },
  frequency_ref: { severity: 'error', field: 'original_ref', fix: 'A corrected (7) or void (8) claim needs the payer\'s claim number of the original (REF*F8).' },
  frequency_unknown: { severity: 'warning', field: 'frequency', fix: 'Professional claims use frequency 1, 7 or 8.' },
  duplicate_line: { severity: 'warning', field: 'code', fix: 'Two lines have the same code, modifiers and date. Combine units, or add a modifier that tells them apart.' },
  duplicate_claim: { severity: 'warning', field: 'claim_id', fix: 'Another claim in this batch bills the same patient, date and code. Check it is not sent twice.' },
  prior_auth: { severity: 'error', field: 'prior_auth', fix: 'This payer requires a prior authorization number for this code. Add it (REF*G1) or get the authorization first.' },
  payer_required: { severity: 'error', field: null, fix: 'Your team taught Sage this payer needs this field. Fill it before sending.' },
  em_modifier_25: { severity: 'warning', field: 'modifiers', fix: 'An E/M and a procedure on the same day: if the visit was separately identifiable, add modifier 25 to the E/M and make sure the note supports it.' },
  late_to_file: { severity: 'warning', field: 'date_of_service', fix: 'This service is near or past the payer\'s filing limit in your config. Send it today or check whether a late-filing exception applies.' },
});

const lineLabel = (l) => `line ${l.line}${l.code ? ` (${l.code})` : ''}`;
const findPayer = (config, c) => (config.payers || []).find((p) => (p.payer_id && p.payer_id === c.payer_id) || payerKey(p.name) === payerKey(c.payer_name));
const codeMatches = (patterns, code) => (patterns || []).some((p) => { const s = str(p).toUpperCase(); return s.endsWith('*') ? str(code).toUpperCase().startsWith(s.slice(0, -1)) : s === str(code).toUpperCase(); });
const isProcedure = (code) => /^[1-6]\d{4}$/.test(str(code)) || /^G0\d{3}$/.test(str(code));

/**
 * Scrub claims. Returns { claims: [{ claim_id, ..., findings }], findings, totals }.
 * config: { payers: [{ name, payer_id, member_id_pattern, prior_auth_codes, timely_days, required_fields }], max_units: { code: n }, warn_days_before_limit }
 * facts: accepted memory facts of kind payer_required_field ({ payer, field, codes?, note? }).
 */
export function scrubClaims(claims, { config = {}, facts = [], asOf } = {}) {
  const out = []; const all = [];
  const seen = new Map();
  for (const c of claims) {
    const f = [];
    const add = (check, message, extra = {}) => { const d = CHECKS[check]; f.push({ claim_id: c.claim_id, check, severity: extra.severity || d.severity, field: extra.field || d.field, message, fix: extra.fix || d.fix, line: extra.line ?? null, code: extra.code ?? null, ...(extra.fact_id ? { fact_id: extra.fact_id } : {}) }); };
    const payer = findPayer(config, c);
    const bp = npiProblem(c.billing_npi); if (bp) add('billing_npi', `Billing NPI ${bp}.`);
    for (const [where, npi] of [['claim', c.rendering_npi], ...c.lines.map((l) => [lineLabel(l), l.rendering_npi])]) { if (!npi) continue; const p = npiProblem(npi); if (p) add('rendering_npi', `Rendering NPI on ${where}: ${p}.`); }
    if (!str(c.payer_id)) add('payer_id', 'No payer id.');
    if (!str(c.member_id)) add('member_id', 'No member id.');
    else if (payer && payer.member_id_pattern && !new RegExp(`^(?:${payer.member_id_pattern})$`, 'i').test(str(c.member_id))) add('member_id_pattern', `Member id does not match the pattern set for ${payer.name}.`);
    const dob = isoDate(c.patient_dob);
    if (!dob) add('patient_dob', 'No date of birth.');
    else if (c.service_from && dob > c.service_from) add('patient_dob', 'Date of birth is after the date of service.');
    if (c.claim_type !== 'institutional' && !str(c.pos) && c.lines.every((l) => !str(l.pos))) add('pos_missing', 'No place of service.');
    for (const p of new Set([c.pos, ...c.lines.map((l) => l.pos)].filter(Boolean))) if (c.claim_type === 'professional' && !POS[p]) add('pos_unknown', `Place of service ${p} is not in the list.`);
    if (['7', '8'].includes(str(c.frequency)) && !str(c.original_ref)) add('frequency_ref', `Frequency ${c.frequency} without the original claim number.`);
    else if (c.claim_type === 'professional' && !['1', '7', '8'].includes(str(c.frequency))) add('frequency_unknown', `Frequency ${c.frequency}.`);
    if (c.lines.length && Math.abs((c.total_charge ?? 0) - c.lines_total) > 0.005) add('total_mismatch', `Claim total ${c.total_charge} but the lines add up to ${c.lines_total}.`);
    if (!c.diagnoses.length && c.claim_type !== 'dental') add('diagnosis_missing', 'No diagnosis codes.');
    for (const d of c.diagnoses) if (!icd10Valid(d.code)) add('diagnosis_format', `Diagnosis ${d.code} is not an ICD-10-CM shape.`, { code: d.code });
    const keys = new Map();
    for (const l of c.lines) {
      const at = { line: l.line, code: l.code };
      if (!l.date_from) add('service_date_missing', `${lineLabel(l)} has no service date.`, at);
      else if (asOf && l.date_from > asOf) add('future_service', `${lineLabel(l)} is dated ${l.date_from}, after ${asOf}.`, at);
      if (!(Number(l.charge) > 0)) add('zero_charge', `${lineLabel(l)} has a charge of ${l.charge ?? 0}.`, at);
      if (!(Number(l.units) > 0)) add('units', `${lineLabel(l)} has units ${l.units ?? 'missing'}.`, at);
      const max = (config.max_units || {})[str(l.code).toUpperCase()];
      if (Number.isFinite(max) && Number(l.units) > max) add('units_high', `${lineLabel(l)} bills ${l.units} units; your limit is ${max}.`, at);
      if (!codeFamily(l.code) || codeFamily(l.code) === 'revenue') { if (c.claim_type !== 'institutional' || !l.revenue_code) add('code_format', `${lineLabel(l)}: "${l.code ?? ''}" is not a procedure code shape.`, at); }
      for (const m of l.modifiers) if (!modifierValid(m)) add('modifier_format', `${lineLabel(l)}: modifier "${m}".`, at);
      for (const [a, b] of MODIFIERS.pairs_that_conflict) if (l.modifiers.includes(a) && l.modifiers.includes(b)) add('modifier_conflict', `${lineLabel(l)} has both ${a} and ${b}.`, at);
      if (c.claim_type === 'professional') {
        if (!l.pointers.length) add('pointer_missing', `${lineLabel(l)} has no diagnosis pointer.`, at);
        for (const p of l.pointers) if (p > c.diagnoses.length) add('pointer_range', `${lineLabel(l)} points to diagnosis ${p}; the claim has ${c.diagnoses.length}.`, at);
      }
      const k = `${l.code}|${[...l.modifiers].sort().join(',')}|${l.date_from}`;
      if (keys.has(k)) add('duplicate_line', `${lineLabel(l)} repeats line ${keys.get(k)}.`, at); else keys.set(k, l.line);
      if (payer && codeMatches(payer.prior_auth_codes, l.code) && !str(l.prior_auth) && !str(c.prior_auth)) add('prior_auth', `${payer.name} needs prior authorization for ${l.code}.`, at);
      const dk = `${str(c.member_id) || str(c.patient_name)}|${l.date_from}|${l.code}`;
      if (seen.has(dk) && seen.get(dk) !== c.claim_id && str(c.frequency) === '1') add('duplicate_claim', `${lineLabel(l)} is also on claim ${seen.get(dk)}.`, at); else if (!seen.has(dk)) seen.set(dk, c.claim_id);
    }
    // E/M with a procedure on the same date and no 25 on the E/M.
    for (const em of c.lines.filter((l) => isEm(l.code))) {
      const proc = c.lines.find((l) => l !== em && isProcedure(l.code) && l.date_from === em.date_from);
      if (proc && !em.modifiers.includes('25')) add('em_modifier_25', `${lineLabel(em)} and ${lineLabel(proc)} on ${em.date_from}; the E/M has no modifier 25.`, { line: em.line, code: em.code });
    }
    for (const field of (payer && payer.required_fields) || []) if (!str(c[field]) && !c.lines.some((l) => str(l[field]))) add('payer_required', `${payer.name} requires ${field} (config).`, { field });
    for (const fact of facts) {
      const v = fact.value || {};
      if (payerKey(v.payer) !== payerKey(c.payer_name) && v.payer !== c.payer_id) continue;
      const lines = v.codes && v.codes.length ? c.lines.filter((l) => codeMatches(v.codes, l.code)) : [null];
      for (const l of lines) {
        const has = l ? str(l[v.field]) || str(c[v.field]) : str(c[v.field]) || c.lines.some((x) => str(x[v.field]));
        if (!has) add('payer_required', `${v.payer} requires ${v.field}${l ? ` for ${l.code}` : ''}${v.note ? ` (${v.note})` : ''}.`, { field: v.field, fact_id: fact.id, ...(l ? { line: l.line, code: l.code } : {}) });
      }
    }
    if (payer && Number.isFinite(payer.timely_days) && c.service_from && asOf) {
      const used = daysBetween(c.service_from, asOf); const warn = Number.isFinite(config.warn_days_before_limit) ? config.warn_days_before_limit : 14;
      if (used >= payer.timely_days - warn) add('late_to_file', `${used} days since the first service date; ${payer.name}'s limit is ${payer.timely_days}.`, used > payer.timely_days ? { severity: 'error' } : {});
    }
    const errors = f.filter((x) => x.severity === 'error').length;
    out.push({ claim_id: c.claim_id, patient_name: c.patient_name, member_id: c.member_id, payer: c.payer_name, payer_id: c.payer_id, date_of_service: c.service_from, total_charge: c.total_charge, lines: c.lines.length, errors, warnings: f.length - errors, ready: errors === 0, findings: f });
    all.push(...f);
  }
  const ready = out.filter((c) => c.ready).length;
  return {
    claims_checked: out.length, ready_to_send: ready, need_fixing: out.length - ready, clean_claim_rate: out.length ? round2((out.filter((c) => !c.findings.length).length / out.length) * 100) : 0,
    errors: all.filter((x) => x.severity === 'error').length, warnings: all.filter((x) => x.severity === 'warning').length,
    by_check: Object.fromEntries(Object.entries(all.reduce((m, x) => { m[x.check] = (m[x.check] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1])),
    charges_held: round2(out.filter((c) => !c.ready).reduce((s, c) => s + (c.total_charge || 0), 0)),
    claims: out, findings: all,
  };
}

/** Fields a payer_required_field fact may name: the claim and line fields Sage reads. */
export const REQUIRABLE_FIELDS = ['prior_auth', 'referral', 'referring_npi', 'rendering_npi', 'clia', 'original_ref', 'group_number', 'onset_date', 'patient_gender'];
