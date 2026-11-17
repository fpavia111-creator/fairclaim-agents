// Anise logic: dental claim line checks (teeth, surfaces, quadrants, frequency, history). No I/O.
import { str, isoDate, ageOn, addMonths, toothValid, QUADRANTS, SURFACES, payerKey } from 'remedy-core';

const ANTERIOR_PERM = new Set([6, 7, 8, 9, 10, 11, 22, 23, 24, 25, 26, 27]);
const PREMOLAR = new Set([4, 5, 12, 13, 20, 21, 28, 29]);
const MOLAR = new Set([1, 2, 3, 14, 15, 16, 17, 18, 19, 30, 31, 32]);
const ANTERIOR_PRIMARY = new Set('CDEFGHMNOPQR'.split(''));
/** Tooth facts from a Universal number: { primary, anterior, kind } or null. */
export function toothInfo(t) {
  const s = str(t).toUpperCase(); if (!toothValid(s)) return null;
  if (/^[A-T]S?$/.test(s)) return { primary: true, anterior: ANTERIOR_PRIMARY.has(s[0]), kind: ANTERIOR_PRIMARY.has(s[0]) ? 'anterior' : 'molar', supernumerary: s.endsWith('S') };
  const n = Number(s); if (n > 50) return { primary: false, anterior: ANTERIOR_PERM.has(n - 50), kind: 'supernumerary', supernumerary: true };
  return { primary: false, anterior: ANTERIOR_PERM.has(n), kind: ANTERIOR_PERM.has(n) ? 'anterior' : PREMOLAR.has(n) ? 'premolar' : 'molar', supernumerary: false };
}

/** Restoration codes by surface count. CDT descriptors: amalgam (any tooth), resin anterior, resin posterior. */
export const RESTORATIONS = Object.freeze({
  D2140: { family: 'amalgam', surfaces: 1 }, D2150: { family: 'amalgam', surfaces: 2 }, D2160: { family: 'amalgam', surfaces: 3 }, D2161: { family: 'amalgam', surfaces: 4 },
  D2330: { family: 'resin_anterior', surfaces: 1 }, D2331: { family: 'resin_anterior', surfaces: 2 }, D2332: { family: 'resin_anterior', surfaces: 3 }, D2335: { family: 'resin_anterior', surfaces: 4 },
  D2391: { family: 'resin_posterior', surfaces: 1 }, D2392: { family: 'resin_posterior', surfaces: 2 }, D2393: { family: 'resin_posterior', surfaces: 3 }, D2394: { family: 'resin_posterior', surfaces: 4 },
});
const FAMILY_CODES = { amalgam: ['D2140', 'D2150', 'D2160', 'D2161'], resin_anterior: ['D2330', 'D2331', 'D2332', 'D2335'], resin_posterior: ['D2391', 'D2392', 'D2393', 'D2394'] };
export const ENDO = Object.freeze({ D3310: 'anterior', D3320: 'premolar', D3330: 'molar' });
const EXTRACTION = /^D7(111|140|210|220|230|240|241|250)$/;
const needsTooth = (c) => /^D2\d{3}$/.test(c) || /^D3[1-4]\d{2}$/.test(c) || EXTRACTION.test(c) || ['D1351', 'D1352', 'D2950', 'D6010', 'D6065', 'D6066'].includes(c);
const needsQuadrant = (c) => ['D4341', 'D4342', 'D4210', 'D4211', 'D4260', 'D4261'].includes(c);

/** Common plan limits used when the config gives none. Illustrative, not any payer's rules. */
export const DEFAULT_FREQUENCY = Object.freeze([
  { label: 'Periodic and comprehensive exams', codes: ['D0120', 'D0150'], max: 2, calendar_year: true, per: 'patient' },
  { label: 'Cleanings (prophylaxis and perio maintenance)', codes: ['D1110', 'D1120', 'D4910'], max: 2, calendar_year: true, per: 'patient' },
  { label: 'Bitewing x-rays', codes: ['D0270', 'D0272', 'D0273', 'D0274'], max: 1, calendar_year: true, per: 'patient' },
  { label: 'Full-mouth or panoramic x-rays', codes: ['D0210', 'D0330'], max: 1, months: 36, per: 'patient' },
  { label: 'Fluoride varnish', codes: ['D1206', 'D1208'], max: 2, calendar_year: true, per: 'patient', age_max: 18 },
  { label: 'Sealants', codes: ['D1351'], max: 1, months: 36, per: 'tooth', age_max: 15 },
  { label: 'Scaling and root planing', codes: ['D4341', 'D4342'], max: 1, months: 24, per: 'quadrant' },
  { label: 'Crown replacement', codes: ['D2740', 'D2750', 'D2751', 'D2752', 'D2790', 'D2791', 'D2792', 'D2794'], max: 1, months: 60, per: 'tooth' },
]);
export const DEFAULT_ATTACHMENTS = Object.freeze([
  { codes: ['D2740', 'D2750', 'D2751', 'D2752', 'D2790', 'D2791', 'D2792', 'D2794', 'D2950'], need: 'a pre-operative x-ray of the tooth' },
  { codes: ['D4341', 'D4342'], need: 'periodontal charting with pocket depths and recent x-rays' },
  { codes: ['D7210', 'D7220', 'D7230', 'D7240', 'D7250'], need: 'an x-ray and a short narrative' },
]);

const quadOf = (q) => QUADRANTS[str(q).toUpperCase()] || null;
const matchCode = (rule, code) => rule.codes.some((c) => (c.endsWith('*') ? code.startsWith(c.slice(0, -1)) : c === code));

/**
 * claims: grouped dental claims (readClaims). history: [{ patient key fields, date, code, tooth, quadrant }].
 * config: { frequency, attachments, primary_tooth_age }. facts: payer_frequency.
 */
export function checkDental(claims, history = [], { config = {}, facts = [] } = {}) {
  const baseRules = (config.frequency || DEFAULT_FREQUENCY).map((r) => ({ ...r, source: config.frequency ? 'config' : 'default' }));
  const memRules = facts.map((f) => ({ ...f.value, source: 'memory', fact_id: f.id }));
  const attachments = config.attachments || DEFAULT_ATTACHMENTS;
  const primaryAge = Number.isFinite(config.primary_tooth_age) ? config.primary_tooth_age : 14;
  const who = (x) => str(x.member_id).toUpperCase() || `${str(x.patient_name).toLowerCase()}|${isoDate(x.patient_dob) || ''}`;
  // Every service a patient had, from history and from these claims, in date order.
  const events = new Map();
  const push = (k, ev) => { const a = events.get(k) || []; a.push(ev); events.set(k, a); };
  for (const h of history) { const code = str(h.code).toUpperCase(); const date = isoDate(h.date_of_service); if (code && date) push(who(h), { code, date, tooth: str(h.tooth).toUpperCase() || null, quadrant: quadOf(h.quadrant), source: 'history' }); }
  const lines = [];
  for (const c of claims) for (const l of c.lines) {
    const date = l.date_from || c.service_from; const code = str(l.code).toUpperCase();
    const ev = { code, date, tooth: str(l.tooth).toUpperCase() || null, quadrant: quadOf(l.quadrant), source: 'claim', claim_id: c.claim_id, line: l.line, seq: lines.length };
    push(who(c), ev);
    lines.push({ c, l, ev, key: who(c) });
  }
  for (const a of events.values()) a.sort((x, y) => (x.date || '').localeCompare(y.date || ''));

  const out = [];
  for (const { c, l, ev, key } of lines) {
    const issues = []; const add = (check, severity, message, extra = {}) => issues.push({ check, severity, message, ...extra });
    const { code, tooth, date } = ev; const surf = (l.surfaces || []).map((s) => str(s).toUpperCase());
    const info = tooth ? toothInfo(tooth) : null;
    const age = c.patient_dob && date ? ageOn(c.patient_dob, date) : null;
    if (!/^D\d{4}$/.test(code)) add('code', 'error', `${code || 'Blank code'} is not a CDT code (D and four digits).`);
    if (tooth && !info) add('tooth', 'error', `Tooth "${tooth}" is not a Universal tooth number (1-32, A-T, or supernumerary 51-82, AS-TS).`);
    if (!tooth && needsTooth(code)) add('tooth', 'error', `${code} needs a tooth number.`);
    if (needsQuadrant(code) && !ev.quadrant) add('quadrant', 'error', `${code} needs a quadrant (UR, UL, LL, LR or 10, 20, 30, 40)${l.quadrant ? `; "${l.quadrant}" is not one` : ''}.`);
    if (info && info.primary && age !== null && age >= primaryAge && !info.supernumerary) add('tooth', 'warning', `Primary tooth ${tooth} on a patient aged ${age}: check the tooth number (permanent teeth are 1-32).`);
    const rest = RESTORATIONS[code];
    if (rest) {
      const bad = surf.filter((s) => !SURFACES.has(s));
      if (!surf.length) add('surfaces', 'error', `${code} needs the surfaces restored.`);
      else if (bad.length) add('surfaces', 'error', `Surface(s) ${bad.join(', ')} are not valid (M, O, D, I, L, B, F).`);
      else if (new Set(surf).size !== surf.length) add('surfaces', 'error', `Surface listed twice: ${surf.join('')}.`);
      else {
        const n = Math.min(4, surf.length);
        if (n !== rest.surfaces && !(code === 'D2335' && n >= 1)) { const right = FAMILY_CODES[rest.family][n - 1]; add('surfaces', 'error', `${code} is a ${rest.surfaces === 4 ? '4+' : rest.surfaces}-surface code but ${surf.join('')} is ${surf.length} surface(s): bill ${right}.`, { suggest: right }); }
      }
      if (info && rest.family === 'resin_anterior' && !info.anterior) add('tooth_type', 'error', `${code} is an anterior resin code but tooth ${tooth} is posterior: use ${FAMILY_CODES.resin_posterior[Math.min(4, surf.length || 1) - 1]}.`);
      if (info && rest.family === 'resin_posterior' && info.anterior) add('tooth_type', 'error', `${code} is a posterior resin code but tooth ${tooth} is anterior: use ${FAMILY_CODES.resin_anterior[Math.min(4, surf.length || 1) - 1]}.`);
      if (info && surf.includes('O') && info.anterior) add('surfaces', 'error', `Occlusal (O) on anterior tooth ${tooth}: anterior teeth have an incisal (I) edge.`);
      if (info && surf.includes('I') && !info.anterior) add('surfaces', 'error', `Incisal (I) on posterior tooth ${tooth}: posterior teeth have an occlusal (O) surface.`);
    }
    if (ENDO[code] && info && !info.primary && info.kind !== ENDO[code]) { const right = Object.entries(ENDO).find(([, k]) => k === info.kind); add('tooth_type', 'error', `${code} is root canal therapy for ${ENDO[code] === 'anterior' ? 'an' : 'a'} ${ENDO[code]} tooth but ${tooth} is ${info.kind === 'anterior' ? 'an' : 'a'} ${info.kind}${right ? `: bill ${right[0]}` : ''}.`); }
    const before = (events.get(key) || []).filter((e) => e !== ev && e.date && date && (e.date < date || (e.date === date && e.source === 'history')));
    if (tooth && !/^D6/.test(code) && !EXTRACTION.test(code)) {
      const x = before.find((e) => e.tooth === tooth && EXTRACTION.test(e.code));
      if (x) add('extracted', 'error', `Tooth ${tooth} was extracted on ${x.date} (${x.code}).`);
    }
    const same = (events.get(key) || []).filter((e) => e !== ev && e.date === date && e.source === 'claim');
    if (same.some((e) => e.code === code && e.tooth === tooth && e.quadrant === ev.quadrant && e.seq < ev.seq)) add('duplicate', 'error', `${code}${tooth ? ` on tooth ${tooth}` : ''} is billed twice on ${date}.`);
    if (/^D434[12]$/.test(code) && same.some((e) => e.code === 'D1110')) add('same_day', 'warning', 'Scaling and root planing with a prophylaxis on the same day: most plans pay one of them.');
    for (const r of [...baseRules, ...memRules]) {
      if (!matchCode(r, code) || issues.some((i) => i.check === 'duplicate')) continue;
      if (r.payer && payerKey(r.payer) !== payerKey(c.payer_name)) continue;
      if (Number.isFinite(r.age_max) && age !== null && age > r.age_max) add('age', 'warning', `${r.label || code}: patient is ${age}; the limit is age ${r.age_max}${r.source === 'memory' ? ' (from memory)' : ''}.`, r.fact_id ? { fact_id: r.fact_id } : {});
      const start = r.calendar_year ? `${date.slice(0, 4)}-01-01` : addMonths(date, -(r.months || 12));
      const prior = before.concat(same.filter((e) => e.seq < ev.seq)).filter((e) => matchCode(r, e.code) && e.date >= start && (r.per === 'tooth' ? e.tooth === tooth : r.per === 'quadrant' ? e.quadrant === ev.quadrant : true));
      if (prior.length >= r.max) add('frequency', 'warning', `${r.label || r.codes.join('/')}: ${r.max} per ${r.calendar_year ? 'calendar year' : `${r.months} months`}${r.per !== 'patient' ? ` per ${r.per}` : ''}${r.payer ? ` for ${r.payer}` : ''}; already ${prior.map((e) => `${e.code} ${e.date}`).join(', ')}. The plan may deny: check the patient's benefits${r.source === 'default' ? ' (this is a common limit, not this plan\'s rule)' : ''}.`, r.fact_id ? { fact_id: r.fact_id } : {});
    }
    for (const a of attachments) if (a.codes.includes(code)) add('attachment', 'info', `Payers usually ask for ${a.need} with ${code}.`);
    const sev = issues.some((i) => i.severity === 'error') ? 'error' : issues.some((i) => i.severity === 'warning') ? 'warning' : issues.length ? 'attach' : 'ok';
    out.push({ claim_id: c.claim_id, line: l.line, patient_name: c.patient_name, payer: c.payer_name, date_of_service: date, code, tooth, surfaces: surf.join(''), quadrant: l.quadrant || null, charge: l.charge, status: sev, issues, ...(issues.find((i) => i.fact_id) ? { fact_id: issues.find((i) => i.fact_id).fact_id } : {}) });
  }
  const order = { error: 0, warning: 1, attach: 2, ok: 3 };
  out.sort((a, b) => order[a.status] - order[b.status] || a.claim_id.localeCompare(b.claim_id) || a.line - b.line);
  const by = {}; for (const r of out) for (const i of r.issues) by[i.check] = (by[i.check] || 0) + 1;
  return { claims: claims.length, lines: out.length, errors: out.filter((r) => r.status === 'error').length, warnings: out.filter((r) => r.status === 'warning').length, attach: out.filter((r) => r.status === 'attach').length, by_check: by, items: out };
}
