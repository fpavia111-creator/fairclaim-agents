// Ginger logic: NCCI procedure-to-procedure (PTP) and medically unlikely edit (MUE) checks. No I/O.
import { str, num, isoDate, payerKey } from 'remedy-core';

/** Modifiers NCCI accepts to bypass a PTP edit with modifier indicator 1 (anatomic, global surgery, distinct, repeat lab). */
export const BYPASS_MODIFIERS = Object.freeze(['59', 'XE', 'XS', 'XP', 'XU', 'E1', 'E2', 'E3', 'E4', 'FA', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'TA', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'LT', 'RT', 'LC', 'LD', 'RC', 'LM', 'RI', '24', '25', '27', '57', '58', '78', '79', '91']);
export const MAI = Object.freeze({ 1: 'line edit: units per claim line', 2: 'date of service edit, policy: units per day, absolute', 3: 'date of service edit, clinical: units per day, may be exceeded with documentation' });

const ANATOMIC = new Set(['E1', 'E2', 'E3', 'E4', 'FA', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'TA', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'LT', 'RT', 'LC', 'LD', 'RC', 'LM', 'RI']);
/** Bypass modifiers that count for a pair: any distinct-service modifier on either line, or anatomic modifiers that differ between the lines. */
export function bypassUsed(m1 = [], m2 = []) {
  const a = m1.map((m) => str(m).toUpperCase()), b = m2.map((m) => str(m).toUpperCase());
  const other = [...new Set([...a, ...b])].filter((m) => BYPASS_MODIFIERS.includes(m) && !ANATOMIC.has(m));
  const sa = a.filter((m) => ANATOMIC.has(m)), sb = b.filter((m) => ANATOMIC.has(m));
  const sides = sa.length && sb.length && sa.join() !== sb.join() ? [...new Set([...sa, ...sb])] : [];
  return [...other, ...sides];
}
const ymd = (v) => { const s = str(v); if (!s || s === '*') return null; if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`; return isoDate(s); };
const active = (e, date) => (!e.effective || !date || e.effective <= date) && (!e.deletion || !date || e.deletion > date);

/** PTP rows → Map("A|B") → [edit]. Modifier indicator is the first digit of the column. */
export function ptpIndex(rows = []) {
  const m = new Map();
  for (const r of rows) {
    const a = str(r.column_1).toUpperCase(), b = str(r.column_2).toUpperCase(); if (!a || !b) continue;
    const ind = (str(r.modifier_indicator).match(/[019]/) || [null])[0];
    const e = { column_1: a, column_2: b, effective: ymd(r.effective), deletion: ymd(r.deletion), modifier_indicator: ind, rationale: str(r.rationale) || null, source: r.source || 'ncci', fact_id: r.fact_id || null, payer: r.payer || null };
    const k = `${a}|${b}`; if (!m.has(k)) m.set(k, []); m.get(k).push(e);
  }
  return m;
}
/** MUE rows → Map(code) → { mue, mai, rationale }. */
export function mueIndex(rows = []) {
  const m = new Map();
  for (const r of rows) { const c = str(r.code).toUpperCase(); const v = num(r.mue); if (!c || v === null) continue; m.set(c, { mue: v, mai: Number((str(r.mai).match(/[123]/) || [null])[0]) || null, rationale: str(r.rationale) || null }); }
  return m;
}

/**
 * Check claims. ptp/mue are the indexes; payerPairs are accepted memory facts { payer, column_1, column_2, note }.
 * Finding kinds: ptp_no_modifier (indicator 0), ptp_needs_modifier (indicator 1, no bypass), ptp_bypassed (indicator 1, bypass present: check documentation),
 * payer_pair (a payer's own pair edit), mue_line (MAI 1), mue_day (MAI 2 or 3, across claims for the same patient and date).
 */
export function checkEdits(claims, { ptp = new Map(), mue = new Map(), payerPairs = [] } = {}) {
  const findings = [];
  const add = (f) => findings.push(f);
  const pairsFor = (a, b, payer) => [...(ptp.get(`${a}|${b}`) || []), ...payerPairs.filter((p) => payerKey(p.payer) === payerKey(payer) && p.column_1 === a && p.column_2 === b)];
  for (const c of claims) {
    const byDate = new Map();
    for (const l of c.lines) { const d = l.date_from || c.service_from; if (!byDate.has(d)) byDate.set(d, []); byDate.get(d).push(l); }
    for (const [date, ls] of byDate) {
      for (const l1 of ls) for (const l2 of ls) {
        if (l1 === l2) continue;
        const a = str(l1.code).toUpperCase(), b = str(l2.code).toUpperCase();
        for (const e of pairsFor(a, b, c.payer_name || c.payer)) {
          if (!active(e, date) || e.modifier_indicator === '9') continue;
          const base = { claim_id: c.claim_id, patient_name: c.patient_name, member_id: c.member_id, payer: c.payer_name || c.payer || null, date_of_service: date, code: b, column_1: a, column_2: b, line: l2.line ?? null, rationale: e.rationale, amount: l2.charge ?? 0 };
          if (e.source === 'memory') { add({ ...base, kind: 'payer_pair', severity: 'error', fact_id: e.fact_id, message: `${base.payer} does not pay ${b} with ${a} on the same day${e.note ? ` (${e.note})` : ''}.`, fix: 'Check the payer policy; remove the column 2 code or appeal with documentation.' }); continue; }
          const by = bypassUsed(l1.modifiers, l2.modifiers);
          if (e.modifier_indicator === '0') add({ ...base, kind: 'ptp_no_modifier', severity: 'error', message: `${b} is bundled into ${a} (NCCI modifier indicator 0); no modifier makes it payable.`, fix: `Do not bill ${b} with ${a} on the same day, or confirm the edit dates.` });
          else if (by.length) add({ ...base, kind: 'ptp_bypassed', severity: 'warning', modifiers: by, message: `${b} with ${a}: the edit allows a modifier and ${by.join(', ')} is on the claim.`, fix: 'Make sure the record shows a separate site, session, encounter or practitioner; auditors look for this.' });
          else add({ ...base, kind: 'ptp_needs_modifier', severity: 'error', message: `${b} is bundled into ${a} (NCCI modifier indicator 1) and no bypass modifier is on either line.`, fix: `If ${b} was distinct (another site, session or lesion), add 59 or an X modifier to ${b} and document it; if not, remove ${b}.` });
        }
      }
    }
    for (const l of c.lines) { const m = mue.get(str(l.code).toUpperCase()); if (m && m.mai === 1 && Number(l.units) > m.mue) add({ claim_id: c.claim_id, patient_name: c.patient_name, member_id: c.member_id, payer: c.payer_name || c.payer || null, date_of_service: l.date_from, code: l.code, line: l.line ?? null, kind: 'mue_line', severity: 'error', units: Number(l.units), mue: m.mue, mai: 1, amount: l.charge ?? 0, rationale: m.rationale, message: `${l.code}: ${l.units} units on one line; the MUE is ${m.mue} per line.`, fix: 'Split onto separate lines with the right anatomic modifiers if each is a separate service; otherwise correct the units.' }); }
  }
  // Date-of-service MUEs: all claims for the same patient and date.
  const day = new Map();
  for (const c of claims) for (const l of c.lines) {
    const m = mue.get(str(l.code).toUpperCase()); if (!m || ![2, 3].includes(m.mai)) continue;
    const k = `${str(c.member_id) || str(c.patient_name)}|${l.date_from}|${str(l.code).toUpperCase()}`;
    const d = day.get(k) || { units: 0, claims: new Set(), c, l, m, charge: 0 }; d.units += Number(l.units) || 0; d.claims.add(c.claim_id); d.charge += l.charge || 0; day.set(k, d);
  }
  for (const d of day.values()) if (d.units > d.m.mue) add({ claim_id: [...d.claims].join(', '), patient_name: d.c.patient_name, member_id: d.c.member_id, payer: d.c.payer_name || d.c.payer || null, date_of_service: d.l.date_from, code: d.l.code, line: null, kind: 'mue_day', severity: d.m.mai === 2 ? 'error' : 'warning', units: d.units, mue: d.m.mue, mai: d.m.mai, amount: Math.round(d.charge * 100) / 100, rationale: d.m.rationale, message: `${d.l.code}: ${d.units} units on ${d.l.date_from} across ${d.claims.size} claim(s); the MUE is ${d.m.mue} per day (${MAI[d.m.mai]}).`, fix: d.m.mai === 2 ? 'Units above a policy MUE are not paid and an appeal will not change that; bill the MUE.' : 'Units above a clinical MUE need documentation of medical necessity; bill the MUE and appeal the rest with the record, or correct the units.' });
  const count = (k) => findings.filter((f) => f.kind === k).length;
  return {
    claims_checked: claims.length, findings_total: findings.length, errors: findings.filter((f) => f.severity === 'error').length, warnings: findings.filter((f) => f.severity === 'warning').length,
    by_kind: { ptp_no_modifier: count('ptp_no_modifier'), ptp_needs_modifier: count('ptp_needs_modifier'), ptp_bypassed: count('ptp_bypassed'), payer_pair: count('payer_pair'), mue_line: count('mue_line'), mue_day: count('mue_day') },
    at_risk_amount: Math.round(findings.filter((f) => f.severity === 'error').reduce((s, f) => s + (f.amount || 0), 0) * 100) / 100,
    findings,
  };
}

/** Look up one pair both ways on a date. */
export function lookupPair(ptp, a, b, date) {
  const A = str(a).toUpperCase(), B = str(b).toUpperCase();
  const hits = [...(ptp.get(`${A}|${B}`) || []), ...(ptp.get(`${B}|${A}`) || [])];
  return hits.map((e) => ({ ...e, active_on_date: date ? active(e, date) : null }));
}
