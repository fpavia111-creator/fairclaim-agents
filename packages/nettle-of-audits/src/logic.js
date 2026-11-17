// Nettle logic: a reproducible audit sample and the scoring of audit results. No I/O.
import { str, num, isEm, modifierList, round2, sha256 } from 'remedy-core';

export const OUTCOMES = Object.freeze(['not_supported', 'upcoded', 'wrong_code', 'downcoded', 'modifier_error', 'dx_error', 'agree']);
const NONE = /^(none|n\/?a|not supported|unsupported|no code|delete|remove|-+)$/i;
const codeKey = (c) => str(c).toUpperCase().replace(/\s+/g, '');
const dxList = (v) => (Array.isArray(v) ? v : str(v).split(/[\s,;|]+/)).map((d) => str(d).toUpperCase().replace(/\./g, '')).filter(Boolean);
const sameSet = (a, b) => a.length === b.length && [...a].sort().join(' ') === [...b].sort().join(' ');
/** E/M family (first four digits) and level (last digit), or null when the code is not an office-style E/M. */
// Critical care (99291 first hour, 99292 each extra half hour) is time-based, not a level: a change between them is a wrong code.
export const emLevel = (code) => (isEm(code) && !/^9929[12]$/.test(code) ? { family: code.slice(0, 4), level: Number(code.slice(4)) } : null);

/**
 * A reproducible sample: every line gets a score from sha256(seed, claim, line, code) and the lowest
 * scores per provider are taken. The same seed and the same charges give the same sample.
 * claims: grouped claims (readClaims). opts: { per_provider, seed, em_only, from, to, focus: [{ code, fact_id? }] }.
 */
export function drawSample(claims, { perProvider = 10, seed = 'remedy', emOnly = false, from = null, to = null, focus = [] } = {}) {
  const lines = [];
  for (const c of claims) for (const l of c.lines) {
    if (!l.code) continue;
    const d = l.date_from || c.service_from;
    if (from && d && d < from) continue; if (to && d && d > to) continue;
    const provider = str(c.provider) || str(l.rendering_npi) || str(c.rendering_npi) || 'unknown';
    const f = focus.find((x) => (x.code.endsWith('*') ? l.code.startsWith(x.code.slice(0, -1).toUpperCase()) : l.code === x.code.toUpperCase()));
    if (emOnly && !isEm(l.code) && !f) continue;
    lines.push({ claim_id: c.claim_id, line: l.line, patient_name: c.patient_name, provider, payer: c.payer_name, date_of_service: d, code: l.code, modifiers: l.modifiers, diagnoses: c.diagnoses.map((x) => x.code), charge: l.charge, score: sha256(`${seed}|${c.claim_id}|${l.line}|${l.code}`).slice(0, 12), reason: f ? 'focus' : 'random', ...(f && f.fact_id ? { fact_id: f.fact_id } : {}) });
  }
  const byProvider = new Map();
  for (const l of lines) { const a = byProvider.get(l.provider) || []; a.push(l); byProvider.set(l.provider, a); }
  const picked = []; const providers = [];
  for (const [provider, ls] of [...byProvider].sort((a, b) => a[0].localeCompare(b[0]))) {
    const focusLines = ls.filter((l) => l.reason === 'focus');
    const random = ls.filter((l) => l.reason === 'random').sort((a, b) => a.score.localeCompare(b.score)).slice(0, perProvider);
    picked.push(...random, ...focusLines);
    providers.push({ provider, lines_in_period: ls.length, random: random.length, focus: focusLines.length, short: ls.length < perProvider });
  }
  return { seed, per_provider: perProvider, lines_in_period: lines.length, sampled: picked.length, providers, lines: picked.map(({ score, ...l }) => l) };
}

/** Classify one audited line. */
export function classify(r) {
  const billed = codeKey(r.billed_code); const audited = codeKey(r.audited_code);
  if (!audited || NONE.test(str(r.audited_code))) return { outcome: 'not_supported', detail: `The record does not support ${billed || 'the billed code'}.` };
  if (billed !== audited) {
    const b = emLevel(billed); const a = emLevel(audited);
    if (b && a && b.family === a.family) return b.level > a.level ? { outcome: 'upcoded', detail: `Billed level ${b.level} (${billed}); the record supports level ${a.level} (${audited}).`, levels: b.level - a.level } : { outcome: 'downcoded', detail: `Billed level ${b.level} (${billed}); the record supports level ${a.level} (${audited}).`, levels: b.level - a.level };
    return { outcome: 'wrong_code', detail: `Billed ${billed}; the record supports ${audited}.` };
  }
  // A blank audited modifier or diagnosis column means "as billed"; "none" means remove them all.
  const bm = modifierList(r.billed_modifiers);
  const am = str(r.audited_modifiers) === '' ? bm : NONE.test(str(r.audited_modifiers)) ? [] : modifierList(r.audited_modifiers);
  if (!sameSet(bm, am)) {
    const add = am.filter((m) => !bm.includes(m)); const drop = bm.filter((m) => !am.includes(m));
    return { outcome: 'modifier_error', detail: `Modifiers: ${[drop.length ? `remove ${drop.join(', ')}` : '', add.length ? `add ${add.join(', ')}` : ''].filter(Boolean).join('; ')}.` };
  }
  const bd = dxList(r.billed_dx); const ad = dxList(r.audited_dx);
  if (ad.length && !sameSet(bd, ad)) {
    const primary = bd[0] && ad[0] && bd[0] !== ad[0];
    return { outcome: 'dx_error', detail: `Diagnosis: ${primary ? `primary should be ${ad[0]}, not ${bd[0]}` : `the record supports ${ad.join(', ')}; billed ${bd.join(', ') || 'none'}`}.` };
  }
  return { outcome: 'agree', detail: 'Billed as the record supports.' };
}

/**
 * Score audit results. rows: AUDIT_FIELDS rows (one per audited line).
 * config: { accuracy_target (95), min_lines (10), probe_size (10), payers: [{ name, refund_days }] }.
 */
export function scoreAudit(rows, { config = {} } = {}) {
  const target = Number.isFinite(config.accuracy_target) ? config.accuracy_target : 95;
  const minLines = Number.isFinite(config.min_lines) ? config.min_lines : 10;
  const probe = Number.isFinite(config.probe_size) ? config.probe_size : 10;
  const items = [];
  for (const r of rows) {
    if (!str(r.billed_code) && !str(r.audited_code)) continue;
    const c = classify(r);
    const billedAmt = num(r.billed_amount); const auditedAmt = num(r.audited_amount);
    const impact = c.outcome === 'not_supported' && billedAmt !== null ? -billedAmt : billedAmt !== null && auditedAmt !== null ? round2(auditedAmt - billedAmt) : null;
    items.push({ claim_id: str(r.claim_id), patient_name: str(r.patient_name) || null, provider: str(r.provider) || 'unknown', payer: str(r.payer) || null, date_of_service: r.date_of_service || null, billed_code: codeKey(r.billed_code), audited_code: codeKey(r.audited_code) || null, outcome: c.outcome, detail: c.detail, billed_amount: billedAmt, audited_amount: auditedAmt, impact, paid: /^(y|yes|paid|true|1)$/i.test(str(r.paid)), auditor_note: str(r.note) || null });
  }
  const providers = [];
  const byP = new Map(); for (const i of items) { const a = byP.get(i.provider) || []; a.push(i); byP.set(i.provider, a); }
  for (const [provider, ls] of byP) {
    const agree = ls.filter((i) => i.outcome === 'agree').length;
    const acc = round2((agree / ls.length) * 100);
    const counts = Object.fromEntries(OUTCOMES.map((o) => [o, ls.filter((i) => i.outcome === o).length]));
    const over = round2(-ls.filter((i) => i.impact !== null && i.impact < 0).reduce((s, i) => s + i.impact, 0));
    const under = round2(ls.filter((i) => i.impact !== null && i.impact > 0).reduce((s, i) => s + i.impact, 0));
    const em = ls.filter((i) => emLevel(i.billed_code));
    const pattern = counts.upcoded >= 2 && counts.upcoded > counts.downcoded * 2 ? 'higher_levels' : counts.downcoded >= 2 && counts.downcoded > counts.upcoded * 2 ? 'lower_levels' : null;
    let action;
    if (ls.length < minLines) action = { action: 'too_few_lines', message: `Only ${ls.length} line(s) audited; ${minLines} are needed before the accuracy means much. Audit ${minLines - ls.length} more.` };
    else if (acc < target) action = { action: 'focused_review', message: `Accuracy ${acc}% is below your ${target}% target: review the errors with the provider, then audit ${probe} new lines in 30 to 90 days.${pattern === 'higher_levels' ? ' Most E/M errors are levels higher than the notes support.' : pattern === 'lower_levels' ? ' Most E/M errors are levels lower than the notes support: money is being left behind.' : ''}` };
    else action = { action: 'meets_target', message: `Accuracy ${acc}% meets your ${target}% target.${pattern === 'lower_levels' ? ' E/M levels tend to be lower than the notes support.' : ''}` };
    providers.push({ provider, lines: ls.length, agree, accuracy: acc, ...counts, em_lines: em.length, overpaid: over, underpaid: under, net_impact: round2(under - over), pattern, ...action });
  }
  providers.sort((a, b) => a.accuracy - b.accuracy || b.lines - a.lines);
  const overpaidPaid = items.filter((i) => i.paid && i.impact !== null && i.impact < 0);
  const order = Object.fromEntries(OUTCOMES.map((o, n) => [o, n]));
  items.sort((a, b) => order[a.outcome] - order[b.outcome] || (a.impact ?? 0) - (b.impact ?? 0));
  const agreeAll = items.filter((i) => i.outcome === 'agree').length;
  return {
    lines: items.length, accuracy: items.length ? round2((agreeAll / items.length) * 100) : null, target,
    by_outcome: Object.fromEntries(OUTCOMES.map((o) => [o, items.filter((i) => i.outcome === o).length]).filter(([, v]) => v)),
    overpaid: round2(-items.filter((i) => i.impact !== null && i.impact < 0).reduce((s, i) => s + i.impact, 0)),
    underpaid: round2(items.filter((i) => i.impact !== null && i.impact > 0).reduce((s, i) => s + i.impact, 0)),
    paid_overpayment_lines: overpaidPaid.length, paid_overpayment: round2(-overpaidPaid.reduce((s, i) => s + i.impact, 0)),
    refund_note: overpaidPaid.length ? `${overpaidPaid.length} paid line(s) were billed higher than the record supports (${round2(-overpaidPaid.reduce((s, i) => s + i.impact, 0))}). Ask your compliance lead whether a refund is owed and by when; for Medicare, an identified overpayment is generally due within 60 days. tansy-of-credits can draft the refund for a person to approve.` : null,
    providers, items,
  };
}

/** Focus codes from config and memory, de-duplicated. */
export function focusCodes(config = {}, facts = []) {
  const out = (config.focus_codes || []).map((code) => ({ code }));
  for (const f of facts) for (const code of [].concat(f.value.codes || f.value.code)) if (code && !out.some((x) => x.code.toUpperCase() === String(code).toUpperCase())) out.push({ code: String(code), fact_id: f.id });
  return out;
}
