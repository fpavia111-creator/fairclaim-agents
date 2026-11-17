// Marjoram logic: registration and insurance data checks, and likely duplicate charts. No I/O.
import { str, isoDate, ageOn, daysBetween, payerKey, nameSimilarity } from 'remedy-core';

const SELF_PAY = /self.?pay|uninsured|no insurance|cash/i;
const SELF = /^(self|18|patient|same)$/i;

/** Medicare Beneficiary Identifier shape (CMS): 11 characters, letters exclude S, L, O, I, B and Z. */
export function mbiValid(v) {
  const s = str(v).toUpperCase().replace(/-/g, '');
  const A = '[AC-HJKMNP-RT-Y]', AN = '[AC-HJKMNP-RT-Y0-9]';
  return new RegExp(`^[1-9]${A}${AN}[0-9]${A}${AN}[0-9]${A}${A}[0-9][0-9]$`).test(s);
}

/** A person-supplied member id pattern, anchored. Refuses patterns that could run for a very long time. */
export function safePattern(p) {
  const s = str(p);
  if (!s || s.length > 80) throw new Error('member id pattern must be 1 to 80 characters');
  if (/\)[*+?{]/.test(s) || /\\[1-9]/.test(s)) throw new Error('member id pattern may not repeat a group or use back-references; write it as a flat pattern such as EHP\\d{9}');
  return new RegExp(`^(?:${s})$`, 'i');
}

export const CHECKS = Object.freeze({
  missing_dob: { severity: 'error', field: 'dob', fix: 'Enter the birth date from the ID or insurance card.' },
  dob_future: { severity: 'error', field: 'dob', fix: 'The birth date is after today; correct it.' },
  dob_implausible: { severity: 'warning', field: 'dob', fix: 'Age over 115: check the birth year.' },
  missing_payer: { severity: 'warning', field: 'payer', fix: 'Enter the insurance or mark the patient self-pay.' },
  missing_member_id: { severity: 'error', field: 'member_id', fix: 'Copy the member id from the card.' },
  member_id_pattern: { severity: 'error', field: 'member_id', fix: 'The id does not have this payer\'s shape: check for a missing prefix or a typo.' },
  mbi_format: { severity: 'error', field: 'member_id', fix: 'Medicare needs the 11-character MBI from the red, white and blue card; an old SSN-based number is rejected.' },
  subscriber_missing: { severity: 'error', field: 'subscriber_name', fix: 'The patient is not the subscriber: enter the subscriber\'s name and birth date.' },
  subscriber_mismatch: { severity: 'warning', field: 'relationship', fix: 'Relationship is self but the subscriber name differs: check which is right.' },
  minor_no_guarantor: { severity: 'warning', field: 'guarantor', fix: 'A minor needs a guarantor (parent or guardian) for statements.' },
  coverage_ended: { severity: 'error', field: 'coverage_end', fix: 'Coverage ended: ask for the new card or mark self-pay before the visit.' },
  same_plan_twice: { severity: 'error', field: 'secondary_payer', fix: 'Primary and secondary are the same plan and id: remove the copy.' },
  zip_format: { severity: 'warning', field: 'zip', fix: 'US ZIP codes are 5 or 9 digits.' },
  state_format: { severity: 'warning', field: 'state', fix: 'Use the two-letter state code.' },
  phone_format: { severity: 'warning', field: 'phone', fix: 'Phone numbers need 10 digits.' },
  not_verified: { severity: 'warning', field: 'verified', fix: 'Insurance has not been verified recently: rescan the card at the next visit.' },
  possible_duplicate: { severity: 'warning', field: 'mrn', fix: 'Another chart has a very similar name and the same birth date: check before booking; a person merges charts.' },
});

const nameOf = (r) => str(r.patient_name) || [str(r.first_name), str(r.last_name)].filter(Boolean).join(' ');

/** rows: REG_FIELDS rows. config: { payers: [{ name, member_id_pattern, id_format }], verify_days, minor_age }. facts: payer_member_id_pattern. */
export function checkRegistrations(rows, { config = {}, facts = [], asOf } = {}) {
  const verifyDays = Number.isFinite(config.verify_days) ? config.verify_days : 365;
  const minor = Number.isFinite(config.minor_age) ? config.minor_age : 18;
  const rules = [...(config.payers || []).map((p) => ({ ...p, source: 'config' })), ...facts.map((f) => ({ name: f.value.payer, member_id_pattern: f.value.pattern, note: f.value.note, source: 'memory', fact_id: f.id }))];
  const issues = []; const patients = [];
  for (const r of rows) {
    const p = { mrn: str(r.mrn), patient_name: nameOf(r) || null, dob: isoDate(r.dob), payer: str(r.payer) || null, member_id: str(r.member_id) || null };
    patients.push(p);
    const add = (check, message, extra = {}) => issues.push({ mrn: p.mrn, patient_name: p.patient_name, check, severity: CHECKS[check].severity, field: CHECKS[check].field, message, fix: CHECKS[check].fix, ...extra });
    if (!p.dob) add('missing_dob', str(r.dob) ? `Birth date "${str(r.dob)}" could not be read.` : 'No birth date.');
    else if (asOf && p.dob > asOf) add('dob_future', `Birth date ${p.dob} is in the future.`);
    else if (asOf && ageOn(p.dob, asOf) > 115) add('dob_implausible', `Birth date ${p.dob} gives age ${ageOn(p.dob, asOf)}.`);
    const age = p.dob && asOf ? ageOn(p.dob, asOf) : null;
    if (!p.payer) add('missing_payer', 'No insurance on file.');
    else if (!SELF_PAY.test(p.payer)) {
      if (!p.member_id) add('missing_member_id', `No member id for ${p.payer}.`);
      else {
        for (const rule of rules.filter((x) => payerKey(x.name) === payerKey(p.payer))) {
          if (rule.id_format === 'mbi' && !mbiValid(p.member_id)) add('mbi_format', `The id for ${p.payer} is not a valid MBI (11 characters, letters except S, L, O, I, B, Z).`, { source: rule.source });
          if (rule.member_id_pattern && !safePattern(rule.member_id_pattern).test(p.member_id.replace(/[\s-]/g, ''))) add('member_id_pattern', `The id for ${p.payer} does not match ${rule.member_id_pattern}${rule.note ? ` (${rule.note})` : ''}.`, { source: rule.source, ...(rule.fact_id ? { fact_id: rule.fact_id } : {}) });
        }
      }
      const rel = str(r.relationship);
      if (rel && !SELF.test(rel) && (!str(r.subscriber_name) || !isoDate(r.subscriber_dob))) add('subscriber_missing', `Relationship is "${rel}" but the subscriber's ${!str(r.subscriber_name) ? 'name' : 'birth date'} is missing.`);
      if (rel && SELF.test(rel) && str(r.subscriber_name) && nameSimilarity(str(r.subscriber_name), p.patient_name) < 0.85) add('subscriber_mismatch', 'Relationship is self but the subscriber is a different person.');
      const end = isoDate(r.coverage_end);
      if (end && asOf && end < asOf) add('coverage_ended', `Coverage with ${p.payer} ended ${end}.`);
      if (str(r.secondary_payer) && payerKey(r.secondary_payer) === payerKey(p.payer) && str(r.secondary_member_id).toUpperCase() === p.member_id?.toUpperCase()) add('same_plan_twice', `Secondary is ${p.payer} with the same id.`);
      const ver = isoDate(r.verified);
      if (ver && asOf && daysBetween(ver, asOf) > verifyDays) add('not_verified', `Insurance last verified ${ver}, ${daysBetween(ver, asOf)} days ago.`);
    }
    if (age !== null && age >= 0 && age < minor && !str(r.guarantor)) add('minor_no_guarantor', `Patient is ${age}; no guarantor.`);
    const zip = str(r.zip); if (zip && !/^\d{5}(-?\d{4})?$/.test(zip)) add('zip_format', `ZIP "${zip.length > 3 ? `${zip.slice(0, 3)}…` : zip}" is not 5 or 9 digits.`);
    const state = str(r.state); if (state && !/^[A-Za-z]{2}$/.test(state)) add('state_format', `State "${state}" is not a two-letter code.`);
    const phone = str(r.phone).replace(/\D/g, ''); if (str(r.phone) && !(phone.length === 10 || (phone.length === 11 && phone[0] === '1'))) add('phone_format', `Phone has ${phone.length} digit(s).`);
  }
  const dups = duplicates(patients);
  for (const d of dups) for (const [a, b] of [[d.a, d.b], [d.b, d.a]]) issues.push({ mrn: a.mrn, patient_name: a.patient_name, check: 'possible_duplicate', severity: 'warning', field: 'mrn', message: `Chart ${b.mrn} has the same birth date and a name ${Math.round(d.score * 100)}% alike.`, fix: CHECKS.possible_duplicate.fix, other_mrn: b.mrn });
  const sev = { error: 0, warning: 1 };
  issues.sort((x, y) => sev[x.severity] - sev[y.severity] || x.mrn.localeCompare(y.mrn));
  const by = issues.reduce((m, i) => { m[i.check] = (m[i.check] || 0) + 1; return m; }, {});
  const withErr = new Set(issues.filter((i) => i.severity === 'error').map((i) => i.mrn)); const withAny = new Set(issues.map((i) => i.mrn));
  return { patients: patients.length, clean: patients.filter((p) => !withAny.has(p.mrn)).length, with_errors: withErr.size, errors: issues.filter((i) => i.severity === 'error').length, warnings: issues.filter((i) => i.severity === 'warning').length, by_check: by, duplicate_pairs: dups.length, issues };
}

/**
 * Pairs of charts with the same birth date and very similar names (and different MRNs).
 * Charts with the exact same name and birth date are grouped first and each is paired with
 * the group's first chart (not every pair), then only distinct names are fuzzy-compared.
 * This keeps a large file with many repeats linear instead of quadratic.
 */
export function duplicates(patients, threshold = 0.88) {
  const out = []; const byDob = new Map();
  const key = (n) => String(n).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
  for (const p of patients) {
    if (!p.dob || !p.patient_name) continue;
    if (!byDob.has(p.dob)) byDob.set(p.dob, new Map());
    const names = byDob.get(p.dob); const k = key(p.patient_name);
    if (!names.has(k)) names.set(k, []);
    const group = names.get(k); if (!group.some((q) => q.mrn === p.mrn)) group.push(p);
  }
  for (const names of byDob.values()) {
    const groups = [...names.values()];
    for (const g of groups) for (let j = 1; j < g.length; j++) out.push({ a: g[0], b: g[j], score: 1 });
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      const a = groups[i][0]; const b = groups[j][0]; if (a.mrn === b.mrn) continue;
      const s = nameSimilarity(a.patient_name, b.patient_name);
      if (s >= threshold) out.push({ a, b, score: Math.round(s * 100) / 100 });
    }
  }
  return out;
}
