// Tansy logic: credit balances, refund deadlines and what to do with each credit. No I/O.
import { str, num, round2, isoDate, addDays, daysBetween, payerKey } from 'remedy-core';

// Whole words: "Self-funded plan" and "BlueCard" are payers, not the patient.
const PATIENT = /^(self|patient|guarantor)$|\b(patient|self.?pay|guarantor|co-?pay(ment)?|cash|check from patient|credit card|debit card|card payment)\b/i;
// The 60-day report-and-return rule (Social Security Act section 1128J(d)) covers Medicare and Medicaid overpayments.
const MEDICARE = /medicare|medicaid|cms\b|\bmac\b/i;

/** Refund deadline days for a payer: the shortest of config, memory and the Medicare default. */
export function refundRule(payer, { config = {}, facts = [] } = {}) {
  const vals = [];
  const p = (config.payers || []).find((x) => payerKey(x.name) === payerKey(payer));
  if (p && Number.isFinite(p.refund_days)) vals.push({ days: p.refund_days, source: 'config' });
  else if (p && p.medicare) vals.push({ days: 60, source: 'medicare_rule' });
  else if (MEDICARE.test(str(payer))) vals.push({ days: 60, source: 'medicare_rule' });
  else if (Number.isFinite(config.default_refund_days)) vals.push({ days: config.default_refund_days, source: 'default' });
  for (const f of facts) if (payerKey(f.value.payer) === payerKey(payer)) vals.push({ days: f.value.refund_days, source: 'memory', fact_id: f.id });
  return vals.sort((a, b) => a.days - b.days)[0] || null;
}

/**
 * rows: CREDIT_FIELDS rows. config: { payers: [{ name, refund_days, medicare }], default_refund_days, small_credit, escheat_days, warn_days }.
 * Returns { credits, total, by_action, items }.
 */
export function reviewCredits(rows, { config = {}, facts = [], asOf } = {}) {
  const small = Number.isFinite(config.small_credit) ? config.small_credit : 0;
  const escheat = Number.isFinite(config.escheat_days) ? config.escheat_days : null;
  const warn = Number.isFinite(config.warn_days) ? config.warn_days : 14;
  const items = [];
  for (const r of rows) {
    let amt = num(r.amount); if (amt === null || amt === 0) continue;
    amt = Math.abs(amt);
    const from = str(r.payment_source) || str(r.payer);
    const patient = PATIENT.test(from) || PATIENT.test(str(r.responsible));
    const credited = isoDate(r.credit_date); const identified = isoDate(r.identified_date) || credited;
    const age = credited && asOf ? daysBetween(credited, asOf) : null;
    const debit = num(r.open_debit) || 0;
    const it = { account: str(r.account) || null, patient_name: str(r.patient_name) || null, claim_id: str(r.claim_id) || null, payer: str(r.payer) || null, refund_to: patient ? 'patient' : (str(r.payer) || from || null), kind: patient ? 'patient_credit' : 'payer_overpayment', amount: round2(amt), credit_date: credited, identified_date: identified, age_days: age, open_debit: round2(debit), refund_deadline: null, days_left: null, rule_source: null, action: 'refund', message: '', reason: str(r.reason) || null };
    if (!patient) {
      const rule = refundRule(it.payer || from, { config, facts });
      if (rule && identified) { it.refund_deadline = addDays(identified, rule.days); it.days_left = asOf ? daysBetween(asOf, it.refund_deadline) : null; it.rule_source = rule.source; if (rule.fact_id) it.fact_id = rule.fact_id; }
    }
    if (!patient && it.days_left !== null && it.days_left < 0) Object.assign(it, { action: 'refund_overdue', message: `Refund deadline ${it.refund_deadline} passed ${-it.days_left} day(s) ago (${it.rule_source === 'medicare_rule' ? '60 days from identification for Medicare and Medicaid' : `${it.rule_source} rule`}). Refund now and record why it was late.` });
    else if (!patient && it.days_left !== null && it.days_left <= warn) Object.assign(it, { action: 'refund_now', message: `${it.days_left} day(s) left to refund (deadline ${it.refund_deadline}).` });
    else if (!patient && it.refund_deadline === null) Object.assign(it, { action: 'refund', message: 'No refund deadline set for this payer: refund promptly or set refund_days in the config.' });
    else if (patient && debit > 0) Object.assign(it, { action: 'apply_to_balance', message: `The account owes ${it.open_debit} elsewhere: apply the credit there first if your policy and the patient allow, then refund what is left.` });
    else if (patient && escheat && age !== null && age >= escheat - 90) Object.assign(it, { action: 'escheat_risk', message: `Credit is ${age} days old; unclaimed-property rules may apply at ${escheat} days. Contact the patient or report it as your state requires.` });
    else if (patient && amt < small) Object.assign(it, { action: 'small_credit', message: `Under your small-credit level (${small}): follow your policy (hold for the next visit or refund on request).` });
    else Object.assign(it, { action: 'refund', message: patient ? 'Refund to the patient (or the card used).' : `Refund to ${it.refund_to}; ${it.days_left} day(s) left.` });
    items.push(it);
  }
  const order = { refund_overdue: 0, refund_now: 1, escheat_risk: 2, apply_to_balance: 3, refund: 4, small_credit: 5 };
  items.sort((a, b) => order[a.action] - order[b.action] || (a.days_left ?? 1e9) - (b.days_left ?? 1e9) || b.amount - a.amount);
  const by = items.reduce((m, i) => { m[i.action] = (m[i.action] || 0) + 1; return m; }, {});
  return { credits: items.length, total: round2(items.reduce((s, i) => s + i.amount, 0)), patient_total: round2(items.filter((i) => i.kind === 'patient_credit').reduce((s, i) => s + i.amount, 0)), payer_total: round2(items.filter((i) => i.kind === 'payer_overpayment').reduce((s, i) => s + i.amount, 0)), overdue_total: round2(items.filter((i) => i.action === 'refund_overdue').reduce((s, i) => s + i.amount, 0)), by_action: by, items };
}
