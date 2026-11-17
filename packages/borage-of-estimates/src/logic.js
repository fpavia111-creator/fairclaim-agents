// Borage logic: good faith estimate timing (business days), bill-versus-estimate checks, estimate lines. No I/O.
import { str, num, round2, isoDate, addDays } from 'remedy-core';

const SELF_PAY = /self.?pay|uninsured|no insurance|cash|none/i;
const yes = (v) => /^(y|yes|true|1|x)$/i.test(str(v));

/** Business days: weekdays that are not in the holiday list. */
export function isBusinessDay(d, holidays = new Set()) { const w = new Date(`${d}T00:00:00Z`).getUTCDay(); return w !== 0 && w !== 6 && !holidays.has(d); }
export function addBusinessDays(d, n, holidays = new Set()) { let x = d; let k = 0; while (k < n) { x = addDays(x, 1); if (isBusinessDay(x, holidays)) k++; } return x; }
/** Business days strictly after a and up to and including b. */
export function businessDaysBetween(a, b, holidays = new Set()) { if (!a || !b || b <= a) return 0; let n = 0; let x = a; while (x < b) { x = addDays(x, 1); if (isBusinessDay(x, holidays)) n++; } return n; }

/**
 * When an estimate is due (45 CFR 149.610 timing as summarised here; check the rule):
 * scheduled 10+ business days ahead → within 3 business days of scheduling;
 * scheduled 3-9 business days ahead → within 1 business day of scheduling;
 * requested → within 3 business days of the request; scheduled under 3 business days ahead → not required at scheduling.
 */
export function gfeDue({ scheduled_on, service_date, requested_on }, holidays = new Set()) {
  const due = [];
  if (scheduled_on && service_date) {
    const ahead = businessDaysBetween(scheduled_on, service_date, holidays);
    if (ahead >= 10) due.push({ due: addBusinessDays(scheduled_on, 3, holidays), basis: `scheduled ${ahead} business days ahead: 3 business days` });
    else if (ahead >= 3) due.push({ due: addBusinessDays(scheduled_on, 1, holidays), basis: `scheduled ${ahead} business days ahead: 1 business day` });
  }
  if (requested_on) due.push({ due: addBusinessDays(requested_on, 3, holidays), basis: 'requested: 3 business days' });
  return due.sort((a, b) => a.due.localeCompare(b.due))[0] || null;
}

/** rows: GFE_FIELDS schedule rows. config: { holidays, warn_days }. Returns { visits, by_status, items }. */
export function checkTiming(rows, { config = {}, asOf } = {}) {
  const hol = new Set((config.holidays || []).map(isoDate).filter(Boolean));
  const items = [];
  for (const r of rows) {
    const coverage = str(r.coverage); const selfPay = !coverage || SELF_PAY.test(coverage) || yes(r.self_pay);
    const it = { appointment_id: str(r.appointment_id) || null, patient_name: str(r.patient_name) || null, coverage: coverage || null, scheduled_on: isoDate(r.scheduled_on), service_date: isoDate(r.service_date), requested_on: isoDate(r.requested_on), issued_on: isoDate(r.issued_on), due_on: null, basis: null, days_left: null, status: 'ok', message: '' };
    if (!selfPay && !it.requested_on) { Object.assign(it, { status: 'not_required', message: 'Insured and billing the plan, with no request: no self-pay estimate is due (estimates for insured patients fall under a separate rule).' }); items.push(it); continue; }
    const d = gfeDue(it, hol);
    if (!d) { Object.assign(it, { status: 'not_required', message: 'Scheduled under 3 business days ahead and not requested: no estimate due at scheduling (give one if asked).' }); items.push(it); continue; }
    it.due_on = d.due; it.basis = d.basis; it.days_left = asOf ? (d.due >= asOf ? businessDaysBetween(asOf, d.due, hol) : -businessDaysBetween(d.due, asOf, hol)) : null;
    if (it.issued_on && it.issued_on > d.due) Object.assign(it, { status: 'late', message: `Issued ${it.issued_on}, after the due date ${d.due} (${d.basis}).` });
    else if (it.issued_on) Object.assign(it, { status: 'ok', message: `Issued ${it.issued_on}; due ${d.due}.` });
    else if (asOf && asOf > d.due) Object.assign(it, { status: 'missing', message: `Due ${d.due} (${d.basis}) and not issued: send it now and record why it was late.` });
    else Object.assign(it, { status: 'due', message: `Due ${d.due} (${it.days_left} business day(s) left): ${d.basis}.` });
    items.push(it);
  }
  const order = { missing: 0, due: 1, late: 2, ok: 3, not_required: 4 };
  items.sort((a, b) => order[a.status] - order[b.status] || String(a.due_on).localeCompare(String(b.due_on)));
  const by = items.reduce((m, i) => { m[i.status] = (m[i.status] || 0) + 1; return m; }, {});
  return { visits: items.length, by_status: by, need_action: (by.missing || 0) + (by.due || 0), items };
}

/** rows: COMPARE_FIELDS (one per estimate and provider). threshold: dollars over the estimate that let a patient dispute (400). */
export function compareBills(rows, { threshold = 400 } = {}) {
  const items = rows.map((r) => {
    const est = num(r.estimate) ?? 0; const billed = num(r.billed) ?? 0; const over = round2(billed - est);
    const status = over >= threshold ? 'dispute_eligible' : over > 0 ? 'over_estimate' : 'within';
    return { gfe_id: str(r.gfe_id) || null, patient_name: str(r.patient_name) || null, provider: str(r.provider) || null, estimate: est, billed, over, status, message: status === 'dispute_eligible' ? `Billed ${over} over the estimate for this provider (${threshold} or more): the patient may start the dispute process; review the bill before it goes out.` : status === 'over_estimate' ? `Billed ${over} over the estimate: under the ${threshold} threshold, but explain the difference to the patient.` : 'Within the estimate.' };
  }).sort((a, b) => b.over - a.over);
  const by = items.reduce((m, i) => { m[i.status] = (m[i.status] || 0) + 1; return m; }, {});
  return { lines: items.length, by_status: by, over_total: round2(items.filter((i) => i.over > 0).reduce((s, i) => s + i.over, 0)), items };
}

/** Estimate lines for codes from a self-pay price list: [{ code, description, price, units }]. */
export function estimateLines(codes, prices, units = {}) {
  const idx = new Map(prices.map((p) => [str(p.code).toUpperCase(), p]));
  return codes.map((c) => { const p = idx.get(str(c).toUpperCase()); const u = units[c] || 1; return { code: str(c).toUpperCase(), description: p ? str(p.description) || null : null, price: p ? num(p.price) : null, units: u, total: p && num(p.price) !== null ? round2(num(p.price) * u) : null }; });
}
