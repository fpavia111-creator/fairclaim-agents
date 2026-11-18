// Fairclaim Modifier Checks logic: modifier checks per claim line. No I/O.
import { str, isEm, payerKey, MODIFIERS } from 'fairclaim-core';

// Short descriptions written for this tool (paraphrased; not the CPT or HCPCS descriptors).
// pricing: changes how the line is paid and goes first; info: informational.
export const MODIFIER_TABLE = Object.freeze({
  22: ['pricing', 'Unusually complex procedure'], 26: ['pricing', 'Professional component only'], TC: ['pricing', 'Technical component only'],
  50: ['pricing', 'Bilateral procedure'], 51: ['pricing', 'Multiple procedures'], 52: ['pricing', 'Reduced service'], 53: ['pricing', 'Discontinued procedure'],
  54: ['pricing', 'Surgical care only'], 55: ['pricing', 'Postoperative care only'], 56: ['pricing', 'Preoperative care only'], 62: ['pricing', 'Two surgeons'], 66: ['pricing', 'Surgical team'],
  80: ['pricing', 'Assistant surgeon'], 81: ['pricing', 'Minimum assistant surgeon'], 82: ['pricing', 'Assistant surgeon when no qualified resident'], AS: ['pricing', 'Non-physician assistant at surgery'],
  24: ['info', 'Unrelated E/M during a postoperative period'], 25: ['info', 'Significant, separately identifiable E/M on the same day as a procedure'], 57: ['info', 'E/M that led to the decision for major surgery'],
  58: ['info', 'Staged or related procedure in the postoperative period'], 59: ['info', 'Distinct procedural service'], 76: ['info', 'Repeat procedure by the same provider'], 77: ['info', 'Repeat procedure by another provider'],
  78: ['info', 'Unplanned return to the operating room'], 79: ['info', 'Unrelated procedure in the postoperative period'], 90: ['info', 'Reference (outside) laboratory'], 91: ['info', 'Repeat clinical laboratory test'],
  33: ['info', 'Preventive service'], 95: ['info', 'Synchronous telemedicine, audio and video'], 93: ['info', 'Synchronous telemedicine, audio only'],
  XE: ['info', 'Separate encounter'], XS: ['info', 'Separate structure or organ'], XP: ['info', 'Separate practitioner'], XU: ['info', 'Unusual non-overlapping service'],
  LT: ['info', 'Left side'], RT: ['info', 'Right side'], E1: ['info', 'Upper left eyelid'], E2: ['info', 'Lower left eyelid'], E3: ['info', 'Upper right eyelid'], E4: ['info', 'Lower right eyelid'],
  FA: ['info', 'Left hand, thumb'], F1: ['info', 'Left hand, second digit'], F2: ['info', 'Left hand, third digit'], F3: ['info', 'Left hand, fourth digit'], F4: ['info', 'Left hand, fifth digit'],
  F5: ['info', 'Right hand, thumb'], F6: ['info', 'Right hand, second digit'], F7: ['info', 'Right hand, third digit'], F8: ['info', 'Right hand, fourth digit'], F9: ['info', 'Right hand, fifth digit'],
  TA: ['info', 'Left foot, great toe'], T1: ['info', 'Left foot, second digit'], T2: ['info', 'Left foot, third digit'], T3: ['info', 'Left foot, fourth digit'], T4: ['info', 'Left foot, fifth digit'],
  T5: ['info', 'Right foot, great toe'], T6: ['info', 'Right foot, second digit'], T7: ['info', 'Right foot, third digit'], T8: ['info', 'Right foot, fourth digit'], T9: ['info', 'Right foot, fifth digit'],
  LC: ['info', 'Left circumflex coronary artery'], LD: ['info', 'Left anterior descending coronary artery'], RC: ['info', 'Right coronary artery'],
  GA: ['info', 'Waiver of liability (ABN) on file'], GY: ['info', 'Statutorily excluded service'], GZ: ['info', 'Expected to be denied, no ABN'], GP: ['info', 'Physical therapy plan of care'], GO: ['info', 'Occupational therapy plan of care'], GN: ['info', 'Speech-language pathology plan of care'],
  KX: ['info', 'Policy requirements met'], CQ: ['pricing', 'Outpatient PT by a PT assistant'], CO: ['pricing', 'Outpatient OT by an OT assistant'], QW: ['info', 'CLIA-waived test'], GT: ['info', 'Interactive audio and video (older code)'],
  AI: ['info', 'Principal physician of record'], SA: ['info', 'Nurse practitioner with a physician'], SG: ['info', 'Ambulatory surgical center facility service'], JW: ['info', 'Drug amount discarded'], JZ: ['info', 'No drug amount discarded'],
  // Anesthesia physical status: some payers add base units for P3 to P5, so they count as payment modifiers.
  P1: ['pricing', 'Physical status: normal healthy patient'], P2: ['pricing', 'Physical status: mild systemic disease'], P3: ['pricing', 'Physical status: severe systemic disease'],
  P4: ['pricing', 'Physical status: severe systemic disease, constant threat to life'], P5: ['pricing', 'Physical status: not expected to survive without the operation'], P6: ['pricing', 'Physical status: declared brain-dead organ donor'],
  ...Object.fromEntries(Object.keys(MODIFIERS.anesthesia).map((k) => [k, ['pricing', MODIFIERS.anesthesia[k]]])),
  ...Object.fromEntries(Object.keys(MODIFIERS.dme).map((k) => [k, ['pricing', MODIFIERS.dme[k]]])),
});

const DISTINCT_X = ['XE', 'XS', 'XP', 'XU'];
const LATERAL = /^(LT|RT|50|E[1-4]|F[A1-9]|T[A1-9]|LC|LD|RC)$/;
const isProcedure = (code) => /^(1\d{4}|[2-6]\d{4})$/.test(str(code)) && !isEm(code);
export const codeMatches = (code, patterns = []) => patterns.some((p) => (p.endsWith('*') ? str(code).toUpperCase().startsWith(p.slice(0, -1).toUpperCase()) : str(code).toUpperCase() === p.toUpperCase()));

export const CHECKS = Object.freeze({
  too_many: { severity: 'error', fix: 'A claim line holds at most four modifiers; keep the ones that change payment and the required ones.' },
  conflicting_pair: { severity: 'error', fix: 'These modifiers contradict each other on one line: keep one, or split the line.' },
  wrong_code_25: { severity: 'error', fix: 'Modifier 25 belongs on the E/M code only; remove it from this line.' },
  wrong_code_57: { severity: 'error', fix: 'Modifier 57 belongs on the E/M code only.' },
  em_needs_25: { severity: 'warning', fix: 'If the E/M was significant and separately identifiable (the note shows it), add 25 to the E/M. If not, the E/M should not be billed.' },
  distinct_redundant: { severity: 'warning', fix: 'Use 59 or one X modifier (XE, XS, XP, XU), not both.' },
  payer_not_accepted: { severity: 'error', fix: 'This payer does not take this modifier: use the replacement in the rule.' },
  payer_needs_one_of: { severity: 'error', fix: 'This payer needs one of these modifiers on this code.' },
  needs_laterality: { severity: 'error', fix: 'Add the side (RT, LT, or 50 for both, or the digit modifier) from the note.' },
  bilateral_units: { severity: 'warning', fix: 'Most payers want modifier 50 on one line with 1 unit; check this payer\'s rule.' },
  repeat_without_first: { severity: 'warning', fix: 'A repeat modifier (76, 77, 91) needs the first service on the same day; check the lines.' },
  pricing_order: { severity: 'warning', fix: 'Put payment modifiers (such as 26, TC, 50, 51, 52) before informational ones.' },
  unknown_modifier: { severity: 'warning', fix: 'Not in Fairclaim Modifier Checks\'s short table: check the code against the current CPT and HCPCS modifier lists.' },
});

/**
 * claims: grouped claims (readClaims). config: { laterality_codes: [...], rules: [{ payer, action, modifiers, codes, note }] }.
 * facts: accepted payer_modifier_rule facts. Returns { claims, lines, issues, by_check, ... }.
 */
export function checkModifiers(claims, { config = {}, facts = [] } = {}) {
  const rules = [...(config.rules || []).map((r) => ({ ...r, source: 'config' })), ...facts.map((f) => ({ ...f.value, source: 'memory', fact_id: f.id }))];
  const lateral = config.laterality_codes || [];
  const issues = []; let lines = 0;
  for (const c of claims) {
    const payer = c.payer_name || c.payer || null;
    const add = (l, check, message, extra = {}) => issues.push({ claim_id: c.claim_id, patient_name: c.patient_name || null, payer, line: l ? l.line : null, code: l ? l.code : null, modifiers: l ? l.modifiers.join(' ') : '', date_of_service: l ? l.date_from : null, check, severity: CHECKS[check].severity, message, fix: CHECKS[check].fix, ...extra });
    // Per claim: how many lines share a code and date, and the procedures on each date (indexed once, not per line).
    const codeDay = new Map(); const procsOn = new Map();
    for (const x of c.lines) {
      const d = x.date_from || null; const k = `${x.code}|${d}`; codeDay.set(k, (codeDay.get(k) || 0) + 1);
      if (isProcedure(x.code)) { if (!procsOn.has(d)) procsOn.set(d, []); procsOn.get(d).push(x); }
    }
    for (const l of c.lines) {
      lines++;
      const mods = (l.modifiers || []).map((m) => str(m).toUpperCase()).filter(Boolean);
      const has = (m) => mods.includes(m);
      if (mods.length > 4) add(l, 'too_many', `${mods.length} modifiers on one line.`);
      for (const [a, b] of MODIFIERS.pairs_that_conflict) if (has(a) && has(b)) add(l, 'conflicting_pair', `${a} and ${b} on the same line.`);
      if (has('25') && !isEm(l.code)) add(l, 'wrong_code_25', `25 on ${l.code}, which is not an E/M code.`);
      if (has('57') && !isEm(l.code)) add(l, 'wrong_code_57', `57 on ${l.code}, which is not an E/M code.`);
      if (has('59') && DISTINCT_X.some(has)) add(l, 'distinct_redundant', `59 with ${DISTINCT_X.filter(has).join(', ')}.`);
      if (has('50') && (l.units || 1) > 1) add(l, 'bilateral_units', `50 with ${l.units} units.`);
      const sameDay = codeDay.get(`${l.code}|${l.date_from || null}`) - 1;
      for (const m of ['76', '77', '91']) if (has(m) && !sameDay) add(l, 'repeat_without_first', `${m} on ${l.code} but no other ${l.code} on ${l.date_from || 'this claim'}.`);
      const firstInfo = mods.findIndex((m) => MODIFIER_TABLE[m] && MODIFIER_TABLE[m][0] === 'info');
      const lastPricing = mods.reduce((k, m, i) => (MODIFIER_TABLE[m] && MODIFIER_TABLE[m][0] === 'pricing' ? i : k), -1);
      if (firstInfo !== -1 && lastPricing > firstInfo) add(l, 'pricing_order', `${mods[lastPricing]} (payment) comes after ${mods[firstInfo]} (informational).`);
      for (const m of mods) if (!MODIFIER_TABLE[m]) add(l, 'unknown_modifier', `${m} is not in the table.`);
      if (codeMatches(l.code, lateral) && !mods.some((m) => LATERAL.test(m))) add(l, 'needs_laterality', `${l.code} has no side or digit modifier.`);
      for (const r of rules) {
        if (payerKey(r.payer) !== payerKey(payer) || (r.codes && r.codes.length && !codeMatches(l.code, r.codes))) continue;
        const ref = { source: r.source, ...(r.fact_id ? { fact_id: r.fact_id } : {}) };
        const rm = (r.modifiers || []).map((m) => str(m).toUpperCase()); if (!rm.length) continue;
        if (r.action === 'not_accepted') for (const m of rm.filter(has)) add(l, 'payer_not_accepted', `${payer} does not accept ${m}${r.note ? `: ${r.note}` : '.'}`, ref);
        if (r.action === 'needs_one_of' && !rm.some(has)) add(l, 'payer_needs_one_of', `${payer} needs one of ${rm.join(', ')} on ${l.code}${r.note ? `: ${r.note}` : '.'}`, ref);
      }
    }
    // E/M with a procedure on the same date and no 25
    const modsOf = (l) => (l.modifiers || []).map((m) => str(m).toUpperCase());
    for (const em of c.lines.filter((l) => isEm(l.code) && !modsOf(l).includes('25') && !modsOf(l).includes('57'))) {
      const procs = procsOn.get(em.date_from || null) || [];
      if (procs.length) add(em, 'em_needs_25', `E/M ${em.code} with ${procs.map((p) => p.code).join(', ')} on the same day and no 25.`);
    }
  }
  const sev = { error: 0, warning: 1 };
  issues.sort((a, b) => sev[a.severity] - sev[b.severity] || String(a.claim_id).localeCompare(String(b.claim_id)) || (a.line ?? 0) - (b.line ?? 0));
  const by = issues.reduce((m, i) => { m[i.check] = (m[i.check] || 0) + 1; return m; }, {});
  const bad = new Set(issues.map((i) => i.claim_id));
  return { claims: claims.length, lines, clean_claims: claims.length - bad.size, errors: issues.filter((i) => i.severity === 'error').length, warnings: issues.filter((i) => i.severity === 'warning').length, by_check: by, issues };
}
