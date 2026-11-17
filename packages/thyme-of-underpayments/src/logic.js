// Thyme logic: expected allowed amounts from a contract, compared with what the payer allowed. No I/O.
import { str, num, round2, payerKey, isoDate } from 'remedy-core';

export const METHODS = ['fee_schedule', 'percent_of_medicare', 'percent_of_charge'];
const codeMatch = (patterns, code) => (patterns || []).some((p) => { const s = str(p).toUpperCase(); return s.endsWith('*') ? str(code).toUpperCase().startsWith(s.slice(0, -1)) : s === str(code).toUpperCase(); });

/** Fee lookup: rows { payer, code, modifier, fee, effective_from, effective_to } → (payer, code, modifiers, date) → row. Blank payer applies to all. */
export function feeIndex(rows = []) {
  const list = rows.map((r) => ({ payer: payerKey(r.payer), code: str(r.code).toUpperCase(), modifier: str(r.modifier).toUpperCase(), fee: num(r.fee), from: isoDate(r.effective_from), to: isoDate(r.effective_to), source: r.source || 'file', fact_id: r.fact_id || null })).filter((r) => r.code && r.fee !== null);
  return (payer, code, mods = [], date = null) => {
    const pk = payerKey(payer); const c = str(code).toUpperCase();
    const ok = list.filter((r) => r.code === c && (!r.payer || r.payer === pk) && (!date || ((!r.from || r.from <= date) && (!r.to || r.to >= date))));
    // Most specific first: payer + modifier, payer, any payer + modifier, any payer.
    const rank = (r) => (r.payer ? 0 : 2) + (r.modifier ? (mods.includes(r.modifier) ? 0 : 9) : 1);
    return ok.filter((r) => !r.modifier || mods.includes(r.modifier)).sort((a, b) => rank(a) - rank(b))[0] || null;
  };
}

/**
 * Check remit lines against the contract.
 * config: { payers: [{ name, method, percent }], modifier_percent: { '26': 40 }, mppr: { codes: ['1*'], percent_after_first: 50 }, tolerance, tolerance_percent }
 * Returns { lines, totals }.
 */
export function checkLines(claims, { config = {}, fees = [], medicare = [], facts = [] } = {}) {
  const contract = feeIndex([...fees, ...facts.map((f) => ({ ...f.value, source: 'memory', fact_id: f.id }))]);
  const fileOnly = feeIndex(fees);
  const mcare = feeIndex(medicare);
  const tol = Number.isFinite(config.tolerance) ? config.tolerance : 0.5;
  const tolPct = Number.isFinite(config.tolerance_percent) ? config.tolerance_percent : 0;
  const modPct = config.modifier_percent || {};
  const lines = [];
  for (const c of claims) {
    const terms = (config.payers || []).find((p) => payerKey(p.name) === payerKey(c.payer));
    // Multiple-procedure ranking: lines whose code is in the MPPR list, highest expected first.
    const mpprLines = config.mppr ? c.lines.filter((l) => codeMatch(config.mppr.codes, l.code) && l.paid + sumAdj(l, 'PR') > 0) : [];
    const base = new Map(); const rowOf = new Map();
    for (const l of c.lines) {
      const allowed = l.allowed ?? round2(l.paid + sumAdj(l, 'PR'));
      const row = { claim_id: c.claim_id, payer: c.payer, patient_name: c.patient_name, member_id: c.member_id, check_number: c.check_number, payment_date: c.payment_date, date_of_service: l.date_from, code: l.code, modifiers: l.modifiers, units: l.units ?? 1, billed: l.charge, paid: l.paid, allowed, allowed_source: l.allowed !== null && l.allowed !== undefined ? 'AMT*B6' : 'paid + patient share', expected: null, method: terms ? terms.method : null, basis: null, variance: null, status: null, notes: [] };
      lines.push(row); rowOf.set(l, row);
      if (l.paid === 0 && sumAdj(l, 'PR') === 0) { row.status = 'denied'; row.notes.push('No payment: a denial, worked in yarrow-of-denials.'); continue; }
      if (!terms) { row.status = 'no_contract'; row.notes.push('No contract terms for this payer in the config.'); continue; }
      // A method that is misspelt, or a percent that is missing, prices nothing rather than an expected amount of 0.
      if (!METHODS.includes(terms.method)) { row.status = 'no_contract'; row.notes.push(`Contract method "${terms.method ?? ''}" for ${terms.name} is not one of ${METHODS.join(', ')}.`); continue; }
      if (terms.method !== 'fee_schedule' && !Number.isFinite(terms.percent)) { row.status = 'no_contract'; row.notes.push(`Contract for ${terms.name} uses ${terms.method} but has no percent.`); continue; }
      let unit = null;
      if (terms.method === 'fee_schedule') {
        const f = contract(c.payer, l.code, l.modifiers, l.date_from);
        if (f) { unit = f.fee; row.basis = `fee ${f.fee}${f.modifier ? ` for -${f.modifier}` : ''}${f.source === 'memory' ? ' (accepted memory)' : ''}`; if (f.source === 'memory') row.fact_id = f.fact_id; if (f.modifier) row.modifier_priced = true; }
        else if (fileOnly(c.payer, l.code, [], l.date_from) === null) { row.status = 'no_fee'; row.notes.push(`${l.code} is not in the fee schedule for ${c.payer}.`); continue; }
      } else if (terms.method === 'percent_of_medicare') {
        const f = mcare(null, l.code, l.modifiers, l.date_from);
        if (!f) { row.status = 'no_fee'; row.notes.push(`${l.code} is not in the Medicare fee file.`); continue; }
        unit = round2(f.fee * (terms.percent / 100)); row.basis = `${terms.percent}% of Medicare ${f.fee}`; if (f.modifier) row.modifier_priced = true;
      } else if (terms.method === 'percent_of_charge') {
        unit = round2((l.charge / (l.units || 1)) * (terms.percent / 100)); row.basis = `${terms.percent}% of charge`;
      }
      let exp = unit * (l.units || 1);
      if (!row.modifier_priced) for (const m of l.modifiers) if (Number.isFinite(modPct[m])) { exp = exp * (modPct[m] / 100); row.basis += `, -${m} at ${modPct[m]}%`; }
      base.set(l, round2(exp));
      row.expected = round2(exp);
    }
    // Apply MPPR: the highest-valued procedure at 100%, the rest at percent_after_first.
    if (mpprLines.length > 1) {
      const ranked = mpprLines.filter((l) => base.has(l)).sort((a, b) => base.get(b) - base.get(a));
      for (const l of ranked.slice(1)) { const r = rowOf.get(l); if (r) { r.expected = round2(r.expected * (config.mppr.percent_after_first / 100)); r.basis += `, multiple procedure at ${config.mppr.percent_after_first}%`; } }
    }
  }
  for (const r of lines) {
    if (r.expected === null) continue;
    r.variance = round2(r.allowed - r.expected);
    const band = Math.max(tol, (tolPct / 100) * r.expected);
    r.status = r.variance < -band ? 'underpaid' : r.variance > band ? 'overpaid' : 'as_contracted';
    if (r.status === 'overpaid') r.notes.push('Allowed more than the contract: the payer may take it back later. Check before posting.');
  }
  const t = (s) => lines.filter((r) => r.status === s);
  return {
    lines_checked: lines.length, priced: lines.filter((r) => r.expected !== null).length,
    underpaid_lines: t('underpaid').length, underpaid_amount: round2(-t('underpaid').reduce((s, r) => s + r.variance, 0)),
    overpaid_lines: t('overpaid').length, overpaid_amount: round2(t('overpaid').reduce((s, r) => s + r.variance, 0)),
    by_status: lines.reduce((m, r) => { m[r.status] = (m[r.status] || 0) + 1; return m; }, {}),
    by_payer: Object.values(t('underpaid').reduce((m, r) => { const k = r.payer || 'unknown'; m[k] = m[k] || { payer: k, count: 0, amount: 0, claims: new Set() }; m[k].count++; m[k].amount = round2(m[k].amount - r.variance); m[k].claims.add(r.claim_id); return m; }, {})).map((x) => ({ ...x, claims: x.claims.size })),
    missing_fees: [...new Set(t('no_fee').map((r) => `${r.payer}: ${r.code}`))],
    lines,
  };
}
function sumAdj(l, group) { return round2((l.adjustments || []).filter((a) => a.group === group).reduce((s, a) => s + (a.amount || 0), 0)); }
