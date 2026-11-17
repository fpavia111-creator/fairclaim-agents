// Cumin logic: DMEPOS line checks and rental tracking. No I/O.
// Payment rules used: capped rental items are paid for at most 13 continuous rental months
// (KH month 1, KI months 2-3, KJ months 4-13); oxygen equipment rental is paid for 36 months.
import { str, isoDate, addMonths, daysBetween, payerKey, modifierList } from 'remedy-core';

/** A small illustrative item table; the config replaces or extends it. Not any MAC's policy. */
export const DEFAULT_ITEMS = Object.freeze([
  { code: 'E0601', label: 'CPAP device', category: 'capped_rental' },
  { code: 'E0260', label: 'Hospital bed, semi-electric, with mattress', category: 'capped_rental' },
  { code: 'E0570', label: 'Nebulizer with compressor', category: 'capped_rental' },
  { code: 'K0001', label: 'Standard wheelchair', category: 'capped_rental' },
  { code: 'E1390', label: 'Oxygen concentrator', category: 'oxygen' },
  { code: 'E0431', label: 'Portable gaseous oxygen system', category: 'oxygen' },
  { code: 'E0114', label: 'Crutches, underarm, pair', category: 'purchase' },
  { code: 'L1833', label: 'Knee orthosis, adjustable', category: 'purchase', paired: true },
  { code: 'L3020', label: 'Foot insert, molded', category: 'purchase', paired: true },
  { code: 'A4253', label: 'Blood glucose test strips, per 50', category: 'supply', max_units: 6 },
  { code: 'A7034', label: 'CPAP nasal mask', category: 'supply', max_units: 1 },
  { code: 'K0823', label: 'Power wheelchair, group 2', category: 'capped_rental', prior_auth: true, order_before_delivery: true },
  { code: 'E0277', label: 'Powered pressure-reducing mattress', category: 'capped_rental', prior_auth: true },
]);
const CAP = { capped_rental: 13, oxygen: 36 };
const KMOD = (m) => (m === 1 ? 'KH' : m <= 3 ? 'KI' : 'KJ');

/** The item rule for a code: config items first, then the built-in table, then learned rules merged in (they only add). */
export function itemRule(code, payer, { items = DEFAULT_ITEMS, facts = [] } = {}) {
  const base = items.find((i) => i.code === code) || null;
  const learned = facts.filter((f) => f.value.code === code && (!f.value.payer || payerKey(f.value.payer) === payerKey(payer)));
  if (!base && !learned.length) return null;
  const r = { ...(base || { code, category: null }) }; const ids = [];
  for (const f of learned) { ids.push(f.id); if (f.value.prior_auth) r.prior_auth = true; if (f.value.kx) r.kx = true; if (f.value.order_before_delivery) r.order_before_delivery = true; if (f.value.paired) r.paired = true; if (Number.isFinite(f.value.max_units)) r.max_units = Number.isFinite(r.max_units) ? Math.min(r.max_units, f.value.max_units) : f.value.max_units; }
  if (ids.length) r.fact_ids = ids;
  return r;
}

const who = (x) => str(x.member_id).toUpperCase() || `${str(x.patient_name).toLowerCase()}|${isoDate(x.patient_dob) || ''}`;

/**
 * Rental periods per patient and item from billed rental months (history and claims), oldest first.
 * A gap of more than gap_days between months starts a new period (a break in need must be documented).
 */
export function rentalPeriods(events, { gapDays = 60 } = {}) {
  const by = new Map();
  for (const e of events) if (e.rental) { const k = `${e.who}|${e.code}`; const a = by.get(k) || []; a.push(e); by.set(k, a); }
  const out = [];
  for (const [k, list] of by) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    let cur = null;
    for (const e of list) {
      if (!cur || daysBetween(cur.last, e.date) > gapDays) { cur = { key: k, code: e.code, who: e.who, start: e.date, last: e.date, months: [], gap_before: cur ? daysBetween(cur.last, e.date) : null }; out.push(cur); }
      // The same month billed again (a resubmission, or a history export that already holds this claim) is not a new rental month.
      if (cur.months.length && cur.last === e.date) { e.month = cur.months.length; e.period = cur; continue; }
      cur.months.push(e); cur.last = e.date; e.month = cur.months.length; e.period = cur;
    }
  }
  return out;
}

/**
 * claims: grouped DME claims (readClaims). history: earlier lines in the same shape as claim lines, flattened:
 * [{ member_id | patient_name, date_of_service, code, modifiers }]. config: { items, gap_days }. facts: dme_item_rule.
 */
export function checkDme(claims, history = [], { config = {}, facts = [], asOf = null } = {}) {
  const items = config.items ? [...config.items, ...DEFAULT_ITEMS.filter((d) => !config.items.some((c) => c.code === d.code))] : DEFAULT_ITEMS;
  const gapDays = Number.isFinite(config.gap_days) ? config.gap_days : 60;
  const events = [];
  for (const h of history) {
    const code = str(h.code).toUpperCase(); const date = isoDate(h.date_of_service); if (!code || !date) continue;
    const mods = modifierList(h.modifiers);
    events.push({ who: who(h), patient_name: str(h.patient_name) || null, code, date, mods, rental: mods.includes('RR'), source: 'history' });
  }
  const lines = [];
  for (const c of claims) for (const l of c.lines) {
    const code = str(l.code).toUpperCase(); const date = l.date_from || c.service_from;
    const e = { who: who(c), patient_name: c.patient_name, code, date, mods: l.modifiers.map((m) => m.toUpperCase()), rental: l.modifiers.map((m) => m.toUpperCase()).includes('RR'), source: 'claim', claim: c, line: l };
    events.push(e); lines.push(e);
  }
  const periods = rentalPeriods(events.filter((e) => e.date), { gapDays });
  // The first line for each (patient, code, date, side); later ones are duplicates. Indexed once, not per line.
  const sideOf = (m) => m.filter((x) => ['RT', 'LT'].includes(x)).join();
  const firstOf = new Map(); lines.forEach((x, i) => { const k = `${x.who}|${x.code}|${x.date}|${sideOf(x.mods)}`; if (!firstOf.has(k)) firstOf.set(k, i); });
  const out = [];
  for (const [idx, e] of lines.entries()) {
    const { claim: c, line: l, code, mods, date } = e;
    const issues = []; const add = (check, severity, message) => issues.push({ check, severity, message });
    const rule = itemRule(code, c.payer_name, { items, facts });
    if (!/^[A-V]\d{4}$/.test(code)) add('code', 'error', `${code || 'Blank code'} is not a HCPCS Level II code (a letter and four digits).`);
    if (!rule) add('unknown_item', 'info', `${code} is not in your item table: add it to the config so its rental, pairing and authorization rules are checked.`);
    const cat = rule && rule.category;
    if (cat === 'capped_rental' || cat === 'oxygen') {
      if (!mods.some((m) => ['RR', 'NU', 'UE'].includes(m))) add('rental_modifier', 'error', `${code} needs RR (rental), or NU or UE if it was bought.`);
      if (e.rental) {
        const cap = CAP[cat]; const m = e.month;
        if (cat === 'capped_rental') {
          const k = mods.find((x) => ['KH', 'KI', 'KJ'].includes(x));
          if (m > cap) add('cap', 'error', `Rental month ${m}: the ${cap}-month cap was reached in ${addMonths(e.period.start, cap - 1).slice(0, 7)}. The patient owns the item; do not bill further rental (maintenance and servicing, if covered, bills with MS).`);
          else if (!k) add('rental_month', 'error', `Rental month ${m} needs ${KMOD(m)}.`);
          else if (k !== KMOD(m)) add('rental_month', 'error', `Rental month ${m} is billed with ${k}; it should be ${KMOD(m)} (KH month 1, KI months 2-3, KJ months 4-13).`);
        }
        if (cat === 'oxygen' && m > cap) add('cap', 'warning', `Oxygen rental month ${m}: equipment rental is paid for ${cap} months; months ${cap + 1} to 60 are not paid, but the supplier must keep furnishing it.`);
        if (e.period.gap_before !== null && m === 1) add('gap', 'warning', `A new rental period starts after a ${e.period.gap_before}-day gap: document the break in need, or the payer may continue the old count.`);
      }
    }
    if (rule && rule.paired && !mods.some((m) => ['RT', 'LT'].includes(m))) add('side', 'error', `${code} needs RT or LT (for both sides, two lines: one RT, one LT).`);
    if (rule && rule.prior_auth && !str(c.prior_auth) && !str(l.prior_auth)) add('prior_auth', 'error', `${code} needs a prior authorization number on the claim.`);
    if (rule && rule.kx && !mods.includes('KX')) add('kx', 'warning', `${code}: add KX only when the coverage documentation is on file.`);
    if (rule && Number.isFinite(rule.max_units) && (l.units ?? 1) > rule.max_units) add('units', 'warning', `${l.units} unit(s) of ${code} is over your limit of ${rule.max_units} per claim line: keep the order and usage notes.`);
    const order = isoDate(l.order_date || c.order_date); const delivered = isoDate(l.delivery_date || c.delivery_date);
    if (rule && rule.order_before_delivery && !order) add('order', 'error', `${code} needs a written order dated before delivery; no order date is given.`);
    if (order && delivered && order > delivered) add('order', rule && rule.order_before_delivery ? 'error' : 'warning', `The order (${order}) is dated after delivery (${delivered}).`);
    if (delivered && date && date < delivered) add('delivery', 'error', `Date of service ${date} is before delivery ${delivered}.`);
    if (cat === 'purchase' && delivered && date && date !== delivered && !e.rental) add('delivery', 'warning', `For a purchased item the date of service is usually the delivery date (${delivered}).`);
    if (firstOf.get(`${e.who}|${code}|${date}|${sideOf(mods)}`) < idx) add('duplicate', 'error', `${code}${mods.length ? `-${mods.join('-')}` : ''} is billed twice for ${date}.`);
    const sev = issues.some((i) => i.severity === 'error') ? 'error' : issues.some((i) => i.severity === 'warning') ? 'warning' : 'ok';
    out.push({ claim_id: c.claim_id, line: l.line, patient_name: c.patient_name, payer: c.payer_name, date_of_service: date, code, item: rule ? rule.label || null : null, modifiers: mods.join(' '), units: l.units ?? 1, charge: l.charge, rental_month: e.rental ? e.month : null, status: sev, issues, ...(rule && rule.fact_ids ? { fact_id: rule.fact_ids[0] } : {}) });
  }
  const order = { error: 0, warning: 1, ok: 2 };
  out.sort((a, b) => order[a.status] - order[b.status] || a.claim_id.localeCompare(b.claim_id) || a.line - b.line);
  const by = {}; for (const r of out) for (const i of r.issues) by[i.check] = (by[i.check] || 0) + 1;
  const rentals = periods.map((p) => {
    const rule = itemRule(p.code, null, { items, facts }); const cat = rule && rule.category; const cap = CAP[cat] || null;
    const n = p.months.length; const sample = p.months[n - 1];
    const next = cap && n >= cap ? null : addMonths(p.last, 1);
    const status = !cap ? 'rental' : n >= cap ? (cat === 'oxygen' ? 'oxygen_cap_reached' : 'capped_owned') : asOf && daysBetween(p.last, asOf) > gapDays ? 'stopped' : 'renting';
    return { patient_name: sample.patient_name || null, code: p.code, item: rule ? rule.label || null : null, category: cat || null, start: p.start, last_billed: p.last, months_billed: n, cap, next_month: status === 'renting' ? n + 1 : null, next_date: status === 'renting' ? next : null, next_modifiers: status === 'renting' && cat === 'capped_rental' ? `RR ${KMOD(n + 1)}` : status === 'renting' ? 'RR' : null, status };
  });
  return { claims: claims.length, lines: out.length, errors: out.filter((r) => r.status === 'error').length, warnings: out.filter((r) => r.status === 'warning').length, by_check: by, items: out, rentals };
}
