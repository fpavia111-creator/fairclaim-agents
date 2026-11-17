// Chamomile logic: A/R aging, timely filing and the follow-up queue. No I/O.
import { str, num, isoDate, daysBetween, bucketOf, payerKey, round2 } from 'remedy-core';

export const BUCKETS = ['0-30', '31-60', '61-90', '91-120', '120+'];
const UNBILLED = /unbilled|draft|hold|not (yet )?(billed|submitted)|ready to bill|pending submission/i;
const PATIENT = /patient|self|guarantor/i;

/** Timely-filing limit for a payer: the shortest of the config entry and accepted memory facts. */
export function filingLimit(config = {}, facts = [], payer) {
  const vals = [];
  const p = (config.payers || []).find((x) => payerKey(x.name) === payerKey(payer));
  if (p && Number.isFinite(p.timely_days)) vals.push({ days: p.timely_days, source: 'config' });
  for (const f of facts) if (payerKey(f.value.payer) === payerKey(payer)) vals.push({ days: f.value.days, source: 'memory', fact_id: f.id });
  if (!vals.length && Number.isFinite(config.default_timely_days)) vals.push({ days: config.default_timely_days, source: 'default' });
  return vals.sort((a, b) => a.days - b.days)[0] || null;
}

/**
 * rows: AR_FIELDS rows (one per claim). config: { payers: [{ name, timely_days }], default_timely_days, age_from, follow_up_days, quiet_days, warn_days }.
 */
export function ageClaims(rows, { config = {}, facts = [], asOf } = {}) {
  const followUp = Number.isFinite(config.follow_up_days) ? config.follow_up_days : 30;
  const quiet = Number.isFinite(config.quiet_days) ? config.quiet_days : 14;
  const warn = Number.isFinite(config.warn_days) ? config.warn_days : 30;
  const items = [];
  for (const r of rows) {
    const balance = num(r.balance); if (!(balance > 0)) continue;
    const dos = isoDate(r.date_of_service), sub = isoDate(r.submitted_date), last = isoDate(r.last_activity);
    const patientOwes = PATIENT.test(str(r.responsible));
    const unbilled = !sub || UNBILLED.test(str(r.status));
    const basis = config.age_from === 'submitted' && sub ? sub : dos || sub;
    const age = basis && asOf ? daysBetween(basis, asOf) : null;
    const lim = patientOwes ? null : filingLimit(config, facts, r.payer);
    const it = { claim_id: str(r.claim_id), patient_name: str(r.patient_name) || null, member_id: str(r.member_id) || null, payer: str(r.payer) || null, provider: str(r.provider) || null, date_of_service: dos, submitted_date: sub, last_activity: last, status: str(r.status) || null, responsible: patientOwes ? 'patient' : 'insurance', charge: num(r.charge), balance, age_days: age, bucket: bucketOf(age, [30, 60, 90, 120]), filing_limit: lim ? lim.days : null, filing_days_left: null, flag: null, next_step: null, priority: 0 };
    if (lim && lim.fact_id) it.fact_id = lim.fact_id;
    if (lim && dos && asOf) {
      if (unbilled) it.filing_days_left = lim.days - daysBetween(dos, asOf);
      else if (sub && daysBetween(dos, sub) > lim.days) it.flag = 'filed_late';
    }
    if (patientOwes) { it.flag = 'patient_balance'; it.next_step = 'Patient balance: send a statement or set up a plan (aloe-of-statements, savory-of-plans).'; }
    else if (it.flag === 'filed_late') it.next_step = `Submitted ${daysBetween(dos, sub)} days after service; the limit is ${lim.days}. Expect a timely-filing denial unless you have proof of an earlier submission.`;
    else if (unbilled && it.filing_days_left !== null && it.filing_days_left < 0) { it.flag = 'past_filing_limit'; it.next_step = 'Past the filing limit and never billed: check for proof of timely filing; otherwise review for write-off by policy.'; }
    else if (unbilled && it.filing_days_left !== null && it.filing_days_left <= warn) { it.flag = 'file_now'; it.next_step = `Not billed and ${it.filing_days_left} day(s) left to file: send it now.`; }
    else if (unbilled) { it.flag = 'unbilled'; it.next_step = 'Not billed yet.'; }
    else if (sub && asOf && daysBetween(sub, asOf) > followUp && (!last || daysBetween(last, asOf) > quiet)) { it.flag = 'follow_up'; it.next_step = `No payment ${daysBetween(sub, asOf)} days after submission${last ? ` and no activity since ${last}` : ''}: check claim status with the payer.`; }
    else { it.flag = 'waiting'; it.next_step = 'Within the payer\'s normal time.'; }
    it.priority = round2(balance * (1 + Math.max(0, age || 0) / 30) * ({ past_filing_limit: 3, file_now: 4, filed_late: 2, follow_up: 1.5 }[it.flag] || 1));
    items.push(it);
  }
  const ins = items.filter((i) => i.responsible === 'insurance');
  const grid = {};
  for (const i of ins) { const k = i.payer || 'unknown'; grid[k] = grid[k] || Object.fromEntries([...BUCKETS, 'unknown', 'total'].map((b) => [b, 0])); grid[k][i.bucket] = round2(grid[k][i.bucket] + i.balance); grid[k].total = round2(grid[k].total + i.balance); }
  const total = round2(ins.reduce((s, i) => s + i.balance, 0));
  const over90 = round2(ins.filter((i) => ['91-120', '120+'].includes(i.bucket)).reduce((s, i) => s + i.balance, 0));
  const by = items.reduce((m, i) => { m[i.flag] = (m[i.flag] || 0) + 1; return m; }, {});
  return {
    claims_open: items.length, insurance_balance: total, patient_balance: round2(items.filter((i) => i.responsible === 'patient').reduce((s, i) => s + i.balance, 0)),
    over_90_percent: total ? round2((over90 / total) * 100) : 0, by_flag: by,
    at_risk_balance: round2(items.filter((i) => ['past_filing_limit', 'file_now', 'filed_late'].includes(i.flag)).reduce((s, i) => s + i.balance, 0)),
    aging_by_payer: grid, payers_without_limit: [...new Set(ins.filter((i) => i.filing_limit === null).map((i) => i.payer).filter(Boolean))],
    items: items.sort((a, b) => b.priority - a.priority),
  };
}
