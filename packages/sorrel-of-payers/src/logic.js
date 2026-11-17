// Sorrel logic: payer scorecard and trend from remittances (and submission dates). No I/O.
import { str, round2, pct, payerKey, daysBetween, denialLines } from 'remedy-core';

const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : round2((s[m - 1] + s[m]) / 2); };

/**
 * remitClaims: claims from readRemits (payer, payment_date, status, charge, paid, patient_responsibility, adjustments).
 * submitted: Map claim_id → submitted date. config: { targets: { days_to_pay, denial_rate, paid_percent }, payers: [{ name, days_to_pay, denial_rate }] }.
 * facts: accepted payer_target facts.
 */
export function scorePayers(remitClaims, { submitted = new Map(), config = {}, facts = [] } = {}) {
  const denials = denialLines(remitClaims);
  const deniedIds = new Map(); for (const d of denials) { const k = `${d.payer}|${d.claim_id}`; if (!deniedIds.has(k)) deniedIds.set(k, []); deniedIds.get(k).push(d); }
  const per = new Map(); const claimRows = [];
  for (const c of remitClaims) {
    const payer = str(c.payer) || 'unknown';
    const P = per.get(payer) || { payer, claims: 0, billed: 0, paid: 0, patient_responsibility: 0, denied_claims: 0, reversals: 0, days: [], categories: {}, months: {} }; per.set(payer, P);
    const reversal = str(c.status) === '22';
    if (reversal) { P.reversals++; continue; }
    const sub = submitted.get(str(c.claim_id)) || null;
    const days = sub && c.payment_date ? daysBetween(sub, c.payment_date) : null;
    const ds = deniedIds.get(`${c.payer}|${c.claim_id}`) || [];
    P.claims++; P.billed += c.charge || 0; P.paid += c.paid || 0; P.patient_responsibility += c.patient_responsibility || 0;
    if (ds.length) { P.denied_claims++; for (const d of new Set(ds.map((x) => x.category))) P.categories[d] = (P.categories[d] || 0) + 1; }
    if (days !== null && days >= 0) P.days.push(days);
    const mo = (c.payment_date || '').slice(0, 7) || 'unknown';
    const M = P.months[mo] || { claims: 0, denied: 0, paid: 0, days: [] }; P.months[mo] = M; M.claims++; M.paid += c.paid || 0; if (ds.length) M.denied++; if (days !== null && days >= 0) M.days.push(days);
    claimRows.push({ payer, claim_id: c.claim_id, patient_name: c.patient_name || null, payment_date: c.payment_date || null, submitted_date: sub, days_to_pay: days, billed: c.charge || 0, paid: c.paid || 0, denied: ds.length > 0, categories: [...new Set(ds.map((x) => x.category))] });
  }
  const t = config.targets || {};
  // A payer's own config target replaces the general one; an accepted memory fact applies only when it is stricter.
  const targetFor = (payer, key) => {
    const own = (config.payers || []).find((x) => payerKey(x.name) === payerKey(payer) && Number.isFinite(x[key]));
    const base = own ? [own[key], 'config'] : Number.isFinite(t[key]) ? [t[key], 'config'] : null;
    const stricter = (a, b) => (key === 'paid_percent' ? a > b : a < b);
    let best = base;
    for (const f of facts) if (payerKey(f.value.payer) === payerKey(payer) && Number.isFinite(f.value[key]) && (!best || stricter(f.value[key], best[0]))) best = [f.value[key], 'memory', f.id];
    return best;
  };
  const payers = [...per.values()].map((P) => {
    const row = { payer: P.payer, claims: P.claims, billed: round2(P.billed), paid: round2(P.paid), paid_percent: pct(P.paid, P.billed), patient_responsibility: round2(P.patient_responsibility), denied_claims: P.denied_claims, denial_rate: pct(P.denied_claims, P.claims), top_denials: Object.entries(P.categories).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`), days_to_pay_avg: P.days.length ? round2(P.days.reduce((s, x) => s + x, 0) / P.days.length) : null, days_to_pay_median: median(P.days), within_30_percent: P.days.length ? pct(P.days.filter((d) => d <= 30).length, P.days.length) : null, timed_claims: P.days.length, reversals: P.reversals, flags: [] };
    const d = targetFor(P.payer, 'days_to_pay'); const r = targetFor(P.payer, 'denial_rate'); const p = targetFor(P.payer, 'paid_percent');
    if (d && row.days_to_pay_median !== null && row.days_to_pay_median > d[0]) row.flags.push({ flag: 'slow', message: `Median ${row.days_to_pay_median} days to pay; target ${d[0]}.`, source: d[1], ...(d[2] ? { fact_id: d[2] } : {}) });
    if (r && row.denial_rate > r[0]) row.flags.push({ flag: 'high_denials', message: `${row.denial_rate}% of claims had a denial; target ${r[0]}%.`, source: r[1], ...(r[2] ? { fact_id: r[2] } : {}) });
    if (p && row.paid_percent < p[0]) row.flags.push({ flag: 'low_paid_percent', message: `Paid ${row.paid_percent}% of billed; target ${p[0]}%.`, source: p[1], ...(p[2] ? { fact_id: p[2] } : {}) });
    if (P.reversals) row.flags.push({ flag: 'reversals', message: `${P.reversals} claim reversal(s): check for a matching recoupment.`, source: 'built_in' });
    row.trend = Object.entries(P.months).sort().map(([month, M]) => ({ month, claims: M.claims, denial_rate: pct(M.denied, M.claims), paid: round2(M.paid), days_to_pay_median: median(M.days) }));
    return row;
  }).sort((a, b) => b.flags.length - a.flags.length || b.denial_rate - a.denial_rate);
  const all = claimRows.filter((c) => c.days_to_pay !== null);
  return { payers, claims: claimRows.length, denied_claims: claimRows.filter((c) => c.denied).length, denial_rate: pct(claimRows.filter((c) => c.denied).length, claimRows.length), days_to_pay_median: median(all.map((c) => c.days_to_pay)), untimed_claims: claimRows.length - all.length, claim_rows: claimRows };
}
