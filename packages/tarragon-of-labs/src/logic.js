// Tarragon logic: lab claim checks (CLIA, waived tests, panels, venipuncture, repeats, diagnoses, frequency). No I/O.
import { str, addMonths, payerKey, icd10Norm, isoDate } from 'remedy-core';

/** Organ and disease panels (CPT): when every component is done, the panel is billed. */
export const PANELS = Object.freeze({
  80048: { name: 'Basic metabolic panel (calcium, total)', components: ['82310', '82374', '82435', '82565', '82947', '84132', '84295', '84520'] },
  80053: { name: 'Comprehensive metabolic panel', components: ['82040', '82247', '82310', '82374', '82435', '82565', '82947', '84075', '84132', '84155', '84295', '84450', '84460', '84520'] },
  80061: { name: 'Lipid panel', components: ['82465', '83718', '84478'] },
  80076: { name: 'Hepatic function panel', components: ['82040', '82247', '82248', '84075', '84155', '84450', '84460'] },
});
export const CLIA_RE = /^\d{2}D\d{7}$/;
const isLab = (code) => /^8\d{4}$/.test(code) || /^\d{4}U$/.test(code);

/**
 * claims: grouped claims (readClaims). history: earlier lines [{ member_id | patient_name, date_of_service, code }].
 * config: { clia, certificate, waived_codes, qw_exempt, dx_rules, frequency, panels }. facts: lab_dx_rule.
 */
export function checkLabs(claims, history = [], { config = {}, facts = [] } = {}) {
  const panels = { ...PANELS, ...Object.fromEntries((config.panels || []).map((p) => [p.code, { name: p.name || p.code, components: p.components }])) };
  const waived = new Set((config.waived_codes || []).map((c) => c.toUpperCase()));
  const qwExempt = new Set((config.qw_exempt || []).map((c) => c.toUpperCase()));
  const cert = config.certificate || null;
  const dxRules = [...(config.dx_rules || []).map((r) => ({ ...r, source: 'config' })), ...facts.map((f) => ({ ...f.value, source: 'memory', fact_id: f.id }))].filter((r) => Array.isArray(r.dx_prefixes) && r.dx_prefixes.length);
  const who = (x) => str(x.member_id).toUpperCase() || str(x.patient_name).toLowerCase();
  const past = history.map((h) => ({ who: who(h), code: str(h.code).toUpperCase(), date: isoDate(h.date_of_service) })).filter((h) => h.date);
  const all = []; // every lab line in these claims, for same-day and frequency checks across claims
  for (const c of claims) for (const l of c.lines) all.push({ c, l, who: who(c), code: str(l.code).toUpperCase(), date: l.date_from || c.service_from });
  const out = [];
  for (const c of claims) {
    const issues = []; const add = (check, severity, message, extra = {}) => issues.push({ check, severity, message, ...extra });
    const lines = all.filter((x) => x.c === c);
    const labLines = lines.filter((x) => isLab(x.code));
    if (!labLines.length && !lines.some((x) => x.code === '36415')) continue;
    const clia = str(c.clia).toUpperCase();
    if (labLines.length) {
      if (!clia) add('clia', 'error', 'Lab tests need the lab\'s CLIA number on the claim (box 23 or loop 2300 REF*X4).');
      else if (!CLIA_RE.test(clia)) add('clia', 'error', `CLIA "${clia}" is not two digits, D, and seven digits.`);
      else if (config.clia && clia !== String(config.clia).toUpperCase()) add('clia', 'error', `CLIA ${clia} is not your lab's (${config.clia}).`);
    }
    // Same patient and day across every claim in the file.
    const day = (x) => all.filter((y) => y.who === x.who && y.date === x.date);
    for (const x of labLines) {
      const mods = x.l.modifiers.map((m) => m.toUpperCase());
      if (waived.has(x.code) && !qwExempt.has(x.code) && !mods.includes('QW')) add('qw', 'error', `${x.code} is a waived test: add QW.`, { code: x.code });
      const repeats = day(x).filter((y) => y.code === x.code && y !== x);
      if (repeats.length && !mods.includes('91') && !mods.includes('59') && all.indexOf(x) > all.indexOf(repeats[0])) add('repeat', 'error', `${x.code} is billed more than once on ${x.date}: add 91 when a test is repeated on the same day for a clinical reason, or remove the duplicate.`, { code: x.code });
    }
    const outside = [...new Set(labLines.filter((x) => !waived.has(x.code)).map((x) => x.code))];
    if (cert === 'waiver' && outside.length) add('certificate', 'error', `${outside.join(', ')} ${outside.length > 1 ? 'are' : 'is'} not on your waived list; a lab with a certificate of waiver may only bill waived tests.`);
    const vp = lines.filter((x) => x.code === '36415');
    for (const x of vp) { const n = day(x).filter((y) => y.code === '36415').reduce((s, y) => s + (y.l.units || 1), 0); if (n > 1 && all.indexOf(x) === all.findIndex((y) => y.who === x.who && y.date === x.date && y.code === '36415')) add('venipuncture', 'error', `36415 is billed ${n} times on ${x.date}: venipuncture is paid once per patient per day.`); }
    // Panels: components with their panel, or every component without it.
    const dates = [...new Set(labLines.map((x) => x.date))];
    for (const d of dates) {
      const codes = new Set(all.filter((y) => y.who === labLines[0].who && y.date === d).map((y) => y.code));
      const mine = new Set(labLines.filter((x) => x.date === d).map((x) => x.code));
      for (const [pc, p] of Object.entries(panels)) {
        if (codes.has(pc)) { const dup = p.components.filter((k) => mine.has(k)); if (dup.length) add('panel_component', 'error', `${dup.join(', ')} ${dup.length > 1 ? 'are' : 'is'} part of ${pc} (${p.name}), billed the same day.`, { code: pc }); }
        else if (p.components.every((k) => codes.has(k)) && p.components.some((k) => mine.has(k))) {
          const bigger = Object.entries(panels).find(([oc, o]) => oc !== pc && o.components.length > p.components.length && p.components.every((k) => o.components.includes(k)) && o.components.every((k) => codes.has(k)));
          const covered = Object.entries(panels).some(([oc, o]) => codes.has(oc) && p.components.some((k) => o.components.includes(k)));
          if (!bigger && !covered) add('unbundled_panel', 'error', `Every component of ${pc} (${p.name}) is billed separately on ${d}: bill ${pc}.`, { code: pc });
        }
      }
    }
    // Diagnoses that support a test (config and memory) and frequency limits.
    const dx = (c.diagnoses || []).map((d) => icd10Norm(d.code));
    const dxShow = dx.map((d) => (d.length > 3 ? `${d.slice(0, 3)}.${d.slice(3)}` : d));
    for (const x of labLines) {
      for (const r of dxRules.filter((r) => r.code === x.code && (!r.payer || payerKey(r.payer) === payerKey(c.payer_name)))) {
        if (!dx.some((d) => r.dx_prefixes.some((p) => d.startsWith(icd10Norm(p))))) add('diagnosis', 'warning', `${x.code}: none of the diagnoses (${dxShow.join(', ') || 'none'}) is on your list for this test (${r.dx_prefixes.join(', ')})${r.note ? `: ${r.note}` : ''}. Check the order, or get an ABN before the test when the patient has Medicare.`, { code: x.code, ...(r.fact_id ? { fact_id: r.fact_id } : {}) });
      }
      for (const f of (config.frequency || []).filter((f) => f.code === x.code)) {
        const from = addMonths(x.date, -f.months);
        const prior = [...past.filter((p) => p.who === x.who), ...all.filter((y) => y.who === x.who && y !== x && all.indexOf(y) < all.indexOf(x))].filter((p) => p.code === x.code && p.date > from && p.date <= x.date);
        if (prior.length >= (f.max || 1)) add('frequency', 'warning', `${x.code} was also done on ${prior.map((p) => p.date).join(', ')}: your rule is ${f.max || 1} per ${f.months} months${f.note ? ` (${f.note})` : ''}.`, { code: x.code });
      }
    }
    const sev = issues.some((i) => i.severity === 'error') ? 'error' : issues.length ? 'warning' : 'ok';
    out.push({ claim_id: c.claim_id, patient_name: c.patient_name, payer: c.payer_name, date_of_service: c.service_from, clia: clia || null, codes: lines.map((x) => `${x.code}${x.l.modifiers.length ? `-${x.l.modifiers.join('-')}` : ''}`).join(' '), diagnoses: dxShow.join(' '), charge: c.lines_total ?? c.total_charge, status: sev, issues, ...(issues.find((i) => i.fact_id) ? { fact_id: issues.find((i) => i.fact_id).fact_id } : {}) });
  }
  const order = { error: 0, warning: 1, ok: 2 };
  out.sort((a, b) => order[a.status] - order[b.status] || a.claim_id.localeCompare(b.claim_id));
  const by = {}; for (const r of out) for (const i of r.issues) by[i.check] = (by[i.check] || 0) + 1;
  return { claims: out.length, errors: out.filter((r) => r.status === 'error').length, warnings: out.filter((r) => r.status === 'warning').length, by_check: by, items: out };
}
