// Fairclaim Denial Worklist logic: pure functions over remittance claims. No I/O.
import { denialLines, DENIAL_CATEGORIES, round2, daysBetween, addDays, payerKey, str } from 'fairclaim-core';

/** Payer-specific mappings from the config and from accepted memory facts. */
export function payerMapFrom(config = {}, facts = []) {
  return [
    ...(config.payer_codes || []).map((m) => ({ ...m, source: 'config' })),
    ...facts.map((f) => ({ ...f.value, id: f.id, source: 'memory' })),
  ];
}

/** Appeal deadline for a payer: config per payer, else the config default, else null. */
export function appealDays(config = {}, payer) {
  const p = (config.payers || []).find((x) => payerKey(x.name) === payerKey(payer));
  return p && Number.isFinite(p.appeal_days) ? p.appeal_days : Number.isFinite(config.appeal_days) ? config.appeal_days : null;
}

const PRIORITY_ORDER = { high: 0, review: 1, medium: 2, low: 3, deadline_passed: 4 };

/**
 * Sort denials into a worklist.
 * Each item: one denying adjustment with its category, team, next step, appeal deadline and priority.
 */
export function sortDenials(claims, { config = {}, facts = [], asOf } = {}) {
  const lines = denialLines(claims, { overrides: config.reason_codes || {}, payerMap: payerMapFrom(config, facts) });
  const today = asOf;
  const items = lines.map((d) => {
    const days = appealDays(config, d.payer);
    const appeal_by = days !== null && d.payment_date ? addDays(d.payment_date, days) : null;
    const days_left = appeal_by && today ? daysBetween(today, appeal_by) : null;
    // A deadline that has passed is not urgent work: it goes last, with a note, so staff work the claims that can still be appealed.
    const passed = days_left !== null && days_left < 0;
    const priority = passed ? 'deadline_passed' : d.category === 'unknown' ? 'review' : (days_left !== null && days_left <= 14) || d.amount >= 500 ? 'high' : d.amount >= 100 ? 'medium' : 'low';
    return { ...d, appeal_by, days_left, priority, ...(passed ? { next_step: `The appeal deadline (${appeal_by}) has passed: check the payer's rules for a late appeal with good cause, otherwise follow your write-off policy. ${d.next_step || ''}`.trim() } : {}) };
  }).sort((a, b) => (PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]) || b.amount - a.amount);
  const by = (k) => { const m = {}; for (const i of items) { const key = i[k] || 'unknown'; m[key] = m[key] || { count: 0, amount: 0, claims: new Set() }; m[key].count++; m[key].amount = round2(m[key].amount + i.amount); m[key].claims.add(i.claim_id); } return Object.fromEntries(Object.entries(m).sort((a, b) => b[1].amount - a[1].amount).map(([key, v]) => [key, { count: v.count, amount: v.amount, claims: v.claims.size }])); };
  const codes = {}; for (const i of items) { const k = `${i.group}-${i.reason}`; codes[k] = codes[k] || { count: 0, amount: 0, category: i.category, text: i.text }; codes[k].count++; codes[k].amount = round2(codes[k].amount + i.amount); }
  const totalAdj = claims.reduce((s, c) => s + c.charge, 0);
  return {
    claims_in_file: claims.length, denials: items.length, claims_with_denials: new Set(items.map((i) => i.claim_id)).size,
    denied_amount: round2(items.reduce((s, i) => s + i.amount, 0)), billed_in_file: round2(totalAdj),
    fully_denied_claims: claims.filter((c) => c.status === '4' || (c.paid === 0 && items.some((i) => i.claim_id === c.claim_id))).length,
    by_category: by('category'), by_payer: by('payer'), by_team: by('team'),
    top_codes: Object.fromEntries(Object.entries(codes).sort((a, b) => b[1].amount - a[1].amount).slice(0, 15)),
    unknown_codes: [...new Set(items.filter((i) => !i.known).map((i) => `${i.group}-${i.reason}`))],
    deadlines_set: items.some((i) => i.appeal_by),
    items,
  };
}

/** Trends: payer × category, provider, procedure code and month of payment. */
export function trends(r) {
  const cell = (m, a, b, amt) => { m[a] = m[a] || {}; m[a][b] = m[a][b] || { count: 0, amount: 0 }; m[a][b].count++; m[a][b].amount = round2(m[a][b].amount + amt); };
  const payerCat = {}, provider = {}, code = {}, month = {};
  for (const i of r.items) {
    cell(payerCat, i.payer || 'unknown', i.category, i.amount);
    cell(provider, i.rendering_npi || 'not on remit', i.category, i.amount);
    cell(code, i.code || 'claim level', i.category, i.amount);
    cell(month, str(i.payment_date).slice(0, 7) || 'unknown', i.category, i.amount);
  }
  return { payer_by_category: payerCat, provider_by_category: provider, code_by_category: code, month_by_category: month };
}

export const CATEGORY_NAMES = Object.keys(DENIAL_CATEGORIES);
