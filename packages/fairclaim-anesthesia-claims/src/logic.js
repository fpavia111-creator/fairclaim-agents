// Fairclaim Anesthesia Claims logic: anesthesia units, times, medical direction and concurrency. No I/O.
import { str, num, isoDate, ageOn, isAnesthesia, modifierList, payerKey, round2 } from 'fairclaim-core';

export const PS_UNITS = Object.freeze({ P1: 0, P2: 0, P3: 1, P4: 2, P5: 3, P6: 0 });
export const QC_UNITS = Object.freeze({ 99100: 1, 99116: 5, 99135: 5, 99140: 2 });
const MD_MODS = ['AA', 'QK', 'QY', 'AD'];
const CRNA_MODS = ['QX', 'QZ'];

/** Minutes since the epoch from a time value and the service date. Accepts ISO datetimes, "MM/DD/YYYY HH:MM" (already converted) and bare "HH:MM" or "HHMM". */
export function toMinutes(v, date) {
  const s = str(v); if (!s) return null;
  let m = /^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}):(\d{2})/.exec(s);
  if (m) return Date.parse(`${m[1]}T00:00:00Z`) / 60000 + Number(m[2]) * 60 + Number(m[3]);
  m = /^(\d{1,2}):?(\d{2})(?:\s*([AaPp])[Mm])?$/.exec(s);
  if (m && date) { let h = Number(m[1]) % (m[3] ? 12 : 24); if (m[3] && /p/i.test(m[3])) h += 12; return Date.parse(`${date}T00:00:00Z`) / 60000 + h * 60 + Number(m[2]); }
  return null;
}
const clock = (mins) => new Date(mins * 60000).toISOString().slice(11, 16);

/** Time units from minutes: 'tenth' (minutes / 15 to one decimal, as Medicare counts), 'up' (whole units, rounded up) or 'nearest'. */
export function timeUnits(minutes, { unitMinutes = 15, rounding = 'tenth' } = {}) {
  if (!(minutes > 0)) return 0;
  const raw = minutes / unitMinutes;
  return rounding === 'up' ? Math.ceil(raw - 1e-9) : rounding === 'nearest' ? Math.round(raw) : Math.round(raw * 10) / 10;
}

/** Group rows (one per line) into anesthesia cases per claim: the anesthesia line plus its qualifying circumstance lines. */
export function anesthesiaClaims(rows) {
  const m = new Map();
  for (const r of rows) {
    const id = str(r.claim_id); if (!id) continue;
    const c = m.get(id) || { claim_id: id, case_id: str(r.case_id) || null, patient_name: str(r.patient_name) || null, patient_dob: isoDate(r.patient_dob), member_id: str(r.member_id) || null, payer: str(r.payer) || null, provider: str(r.provider) || str(r.rendering_npi) || null, date: isoDate(r.date_of_service), code: null, modifiers: [], start: null, end: null, minutes_reported: null, units_reported: null, charge: 0, qc: [], other: [] };
    const code = str(r.code).toUpperCase();
    if (isAnesthesia(code) && !c.code) {
      Object.assign(c, { code, modifiers: modifierList(r.modifiers), start: toMinutes(r.start_time, isoDate(r.date_of_service)), end: toMinutes(r.end_time, isoDate(r.date_of_service)), start_raw: str(r.start_time) || null, end_raw: str(r.end_time) || null, minutes_reported: num(r.minutes), units_reported: num(r.units) });
      if (!c.case_id && str(r.case_id)) c.case_id = str(r.case_id);
    } else if (QC_UNITS[code] !== undefined) c.qc.push(code);
    else if (code) c.other.push(code);
    c.charge = round2(c.charge + (num(r.charge) || 0));
    m.set(id, c);
  }
  return [...m.values()];
}

/**
 * Check anesthesia claims. baseUnits: Map code -> base units. config: { unit_minutes, rounding, max_minutes,
 * payers: [{ name, conversion_factor, unit_minutes, rounding, ps_qc_units }] }. facts: payer_ps_required.
 */
export function checkAnesthesia(claims, baseUnits, { config = {}, facts = [] } = {}) {
  const payerCfg = (p) => (config.payers || []).find((x) => payerKey(x.name) === payerKey(p)) || {};
  const maxMinutes = Number.isFinite(config.max_minutes) ? config.max_minutes : 720;
  // Fill in times: end before start means the case crossed midnight.
  for (const c of claims) if (c.start !== null && c.end !== null && c.end < c.start) c.end += 1440;
  const caseKey = (c) => c.case_id || `${str(c.member_id).toUpperCase() || str(c.patient_name).toLowerCase()}|${c.date}|${c.code}`;
  const role = (c) => (c.modifiers.some((m) => CRNA_MODS.includes(m)) ? 'crna' : c.modifiers.some((m) => MD_MODS.includes(m)) ? 'anesthesiologist' : null);
  // Concurrency: the most cases each directing anesthesiologist covered at one moment.
  const directing = claims.filter((c) => role(c) === 'anesthesiologist' && c.start !== null && c.end !== null);
  const peak = new Map();
  for (const c of directing) {
    const mine = directing.filter((x) => x.provider === c.provider && caseKey(x) !== caseKey(c) && x.start < c.end && c.start < x.end);
    const points = [c.start, ...mine.map((x) => x.start)].filter((t) => t >= c.start && t < c.end);
    let most = 1;
    for (const t of points) most = Math.max(most, 1 + mine.filter((x) => x.start <= t && t < x.end).length);
    peak.set(c, { most, overlaps: mine });
  }
  const out = [];
  for (const c of claims) {
    const issues = []; const add = (check, severity, message) => issues.push({ check, severity, message });
    const pc = payerCfg(c.payer);
    const unitMinutes = pc.unit_minutes || config.unit_minutes || 15; const rounding = pc.rounding || config.rounding || 'tenth';
    if (!c.code) { add('code', 'error', `No anesthesia code (00100-01999) on the claim${c.other.length ? `; found ${c.other.join(', ')}` : ''}.`); out.push(row(c, issues, null)); continue; }
    const base = baseUnits.get(c.code);
    if (base === undefined) add('base_units', 'error', `${c.code} is not in your base unit table: load the CMS anesthesia base units file for the year.`);
    let minutes = null;
    if (c.start === null || c.end === null) add('time', 'error', `Start and stop times are needed (${c.start_raw || 'no start'} to ${c.end_raw || 'no stop'}).`);
    else {
      minutes = c.end - c.start;
      if (minutes <= 0) add('time', 'error', 'Stop time is not after the start time.');
      else if (minutes > maxMinutes) add('time', 'warning', `${minutes} minutes is longer than your ${maxMinutes}-minute check: confirm the times.`);
      if (c.minutes_reported !== null && minutes > 0 && Math.abs(c.minutes_reported - minutes) > 1) add('time', 'error', `Reported ${c.minutes_reported} minutes, but ${clock(c.start)} to ${clock(c.end)} is ${minutes}.`);
    }
    const r = role(c);
    const mm = c.modifiers.filter((m) => [...MD_MODS, ...CRNA_MODS].includes(m));
    if (!mm.length) add('pricing_modifier', 'error', 'No anesthesia pricing modifier (AA, QK, QY, AD, QX or QZ).');
    else if (mm.length > 1) add('pricing_modifier', 'error', `More than one pricing modifier: ${mm.join(', ')}.`);
    const ps = c.modifiers.find((m) => /^P[1-6]$/.test(m));
    const psFact = facts.find((f) => payerKey(f.value.payer) === payerKey(c.payer));
    if (!ps) add('physical_status', psFact ? 'error' : 'warning', `No physical status modifier (P1-P6)${psFact ? `: ${c.payer} requires one${psFact.value.note ? ` (${psFact.value.note})` : ''}` : ''}.`);
    if (c.qc.includes('99100') && c.patient_dob && c.date) { const age = ageOn(c.patient_dob, c.date); if (age !== null && age >= 1 && age <= 70) add('qualifying', 'error', `99100 is for patients under 1 or over 70; this patient is ${age}.`); }
    // Medical direction and concurrency.
    const p = peak.get(c);
    if (p && mm.length === 1) {
      const mod = mm[0];
      const want = p.most === 1 ? ['QY', 'AA'] : p.most <= 4 ? ['QK'] : ['AD'];
      if (mod === 'AA' && p.most > 1) add('concurrency', 'error', `AA (personally performed) but ${c.provider} had ${p.most} cases at once: ${p.overlaps.map((x) => `${x.claim_id} ${clock(x.start)}-${clock(x.end)}`).join(', ')}.`);
      else if (mod !== 'AA' && !want.includes(mod)) add('concurrency', 'error', `${mod} but ${c.provider} covered at most ${p.most} case(s) at once during this one: use ${want.filter((x) => x !== 'AA').join(' or ')}.`);
    }
    const twins = claims.filter((x) => x !== c && caseKey(x) === caseKey(c));
    if (r === 'crna' && c.modifiers.includes('QX') && !twins.some((x) => x.modifiers.some((m) => ['QK', 'QY'].includes(m)))) add('pairing', 'error', 'QX (CRNA with medical direction) but no anesthesiologist claim with QK or QY for the same case.');
    if (r === 'anesthesiologist' && c.modifiers.some((m) => ['QK', 'QY'].includes(m)) && !twins.some((x) => x.modifiers.includes('QX'))) add('pairing', 'warning', `${c.modifiers.find((m) => ['QK', 'QY'].includes(m))} but no CRNA claim with QX for the same case was found in this file.`);
    if (c.modifiers.includes('QZ') && twins.some((x) => x.modifiers.some((m) => ['QK', 'QY', 'AD'].includes(m)))) add('pairing', 'error', 'QZ (CRNA without medical direction) but an anesthesiologist billed medical direction for the same case.');
    if (c.modifiers.includes('AA') && twins.some((x) => x.modifiers.some((m) => ['QX', 'QZ'].includes(m)))) add('pairing', 'error', 'AA (personally performed) but a CRNA billed the same case: medical direction (QK/QY with QX) or QZ applies.');
    if (r === 'crna' && c.start !== null && c.end !== null) {
      const clash = claims.filter((x) => x !== c && x.provider === c.provider && role(x) === 'crna' && x.start !== null && x.start < c.end && c.start < x.end);
      if (clash.length) add('overlap', 'error', `${c.provider} has overlapping cases: ${clash.map((x) => x.claim_id).join(', ')}. A CRNA bills one case at a time.`);
    }
    // Units.
    const tu = minutes > 0 ? timeUnits(minutes, { unitMinutes, rounding }) : 0;
    const psqc = pc.ps_qc_units ? (PS_UNITS[ps] || 0) + c.qc.reduce((s, q) => s + QC_UNITS[q], 0) : 0;
    const units = base !== undefined ? round2(base + tu + psqc) : null;
    if (units !== null && c.units_reported !== null && Math.abs(c.units_reported - units) > 0.05) add('units', 'warning', `Billed ${c.units_reported} unit(s); base ${base} + time ${tu}${psqc ? ` + physical status and qualifying ${psqc}` : ''} = ${units}.`);
    const cf = pc.conversion_factor;
    const factor = c.modifiers.some((m) => ['QK', 'QY', 'QX'].includes(m)) ? 0.5 : c.modifiers.includes('AD') ? null : 1;
    const expected = units !== null && cf ? (factor === null ? null : round2(units * cf * factor)) : null;
    out.push(row(c, issues, { minutes, base: base ?? null, time_units: tu, ps_qc_units: psqc, units, expected, concurrency: p ? p.most : null, rounding, unit_minutes: unitMinutes }));
  }
  const order = { error: 0, warning: 1, ok: 2 };
  out.sort((a, b) => order[a.status] - order[b.status] || a.claim_id.localeCompare(b.claim_id));
  const by = {}; for (const r of out) for (const i of r.issues) by[i.check] = (by[i.check] || 0) + 1;
  return { claims: out.length, errors: out.filter((r) => r.status === 'error').length, warnings: out.filter((r) => r.status === 'warning').length, by_check: by, items: out };

  function row(c, issues, u) {
    const sev = issues.some((i) => i.severity === 'error') ? 'error' : issues.some((i) => i.severity === 'warning') ? 'warning' : 'ok';
    const psFact = facts.find((f) => payerKey(f.value.payer) === payerKey(c.payer));
    return { claim_id: c.claim_id, case_id: c.case_id, patient_name: c.patient_name, payer: c.payer, provider: c.provider, date_of_service: c.date, code: c.code, modifiers: c.modifiers.join(' '), qualifying: c.qc.join(' '), start: c.start !== null ? clock(c.start) : null, stop: c.end !== null ? clock(c.end) : null, minutes: u ? u.minutes : null, base_units: u ? u.base : null, time_units: u ? u.time_units : null, extra_units: u ? u.ps_qc_units : null, units: u ? u.units : null, units_billed: c.units_reported, expected_allowed: u ? u.expected : null, concurrency: u ? u.concurrency : null, charge: c.charge, status: sev, issues, ...(psFact && issues.some((i) => i.check === 'physical_status') ? { fact_id: psFact.id } : {}) };
  }
}
