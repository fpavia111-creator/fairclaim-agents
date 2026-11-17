// Fennel logic: remittance payments against bank deposits, and provider-level adjustments. No I/O.
import { str, round2, isoDate, daysBetween, payerKey, PLB_REASONS } from 'remedy-core';

const normTrace = (v) => str(v).toUpperCase().replace(/[^A-Z0-9]/g, '');
/** Trace numbers a deposit carries: its trace column, and any TRN*1*... in the description (ACH CCD+ addenda). */
export function depositTraces(d) {
  const out = new Set();
  if (str(d.trace_number)) out.add(normTrace(d.trace_number));
  for (const m of str(d.description).matchAll(/TRN\*1\*([^*\\~\s]+)/gi)) out.add(normTrace(m[1]));
  return [...out].filter(Boolean);
}
const INSURANCE_HINT = /HCCLAIMPMT|HC CLAIM|CLAIM PMT|TRN\*1\*|MEDICARE|MEDICAID|INSURANCE|HEALTH PLAN|MUTUAL/i;

/** Which payer a deposit description names: an ERA payer, or a bank text a person taught Fennel. */
export function likelyPayer(d, payers, aliases = []) {
  const text = `${str(d.description)} ${str(d.payer)}`.toUpperCase();
  const a = aliases.find((x) => str(x.bank_text) && text.includes(str(x.bank_text).toUpperCase()));
  if (a) return { payer: a.payer, by: 'memory', fact_id: a.id || null };
  const p = payers.find((n) => n && text.replace(/[^A-Z0-9]/g, '').includes(payerKey(n).toUpperCase()));
  return p ? { payer: p, by: 'name' } : null;
}

/**
 * Match payments to deposits.
 * payments: [{ trace_number, payer, date, amount, method }]; deposits: DEPOSIT_FIELDS rows.
 * Order: trace number (amount compared), then exact amount within the date window, closest date first.
 */
export function matchPayments(payments, deposits, { windowDays = 5, aliases = [], ignore = [] } = {}) {
  const deps = deposits.map((d, i) => ({ ...d, _i: i, deposit_id: str(d.deposit_id) || `row ${i + 1}`, date: isoDate(d.date), amount: round2(Number(d.amount) || 0), traces: depositTraces(d), used: false }))
    .filter((d) => d.amount > 0 && !ignore.some((p) => str(d.description).toUpperCase().includes(str(p).toUpperCase())));
  const rows = [];
  for (const p of payments) {
    const amt = round2(Number(p.amount) || 0);
    const base = { trace_number: p.trace_number, payer: p.payer, payment_date: p.date, method: p.method || null, era_amount: amt, claims: p.claims ?? null };
    if (amt === 0) { rows.push({ ...base, status: 'no_money_expected', deposit_id: null, deposit_date: null, deposit_amount: null, difference: 0, note: 'The remittance pays nothing (denials or offsets only).' }); continue; }
    const t = normTrace(p.trace_number);
    let d = t ? deps.find((x) => !x.used && x.traces.includes(t)) : null;
    let by = 'trace';
    if (!d) {
      const cands = deps.filter((x) => !x.used && Math.abs(x.amount - amt) < 0.005 && x.date && p.date && Math.abs(daysBetween(p.date, x.date)) <= windowDays).sort((a, b) => Math.abs(daysBetween(p.date, a.date)) - Math.abs(daysBetween(p.date, b.date)));
      d = cands[0] || null; by = cands.length > 1 ? 'amount_ambiguous' : 'amount_date';
    }
    if (!d) { rows.push({ ...base, status: 'no_deposit', deposit_id: null, deposit_date: null, deposit_amount: null, difference: amt, note: str(p.method).toUpperCase() === 'CHK' ? 'Paper check: find the check in the deposit list or the lockbox.' : `No deposit with this trace number or this amount within ${windowDays} days.` }); continue; }
    d.used = true;
    const diff = round2(amt - d.amount);
    const status = Math.abs(diff) >= 0.005 ? 'amount_mismatch' : by === 'trace' ? 'matched' : by === 'amount_ambiguous' ? 'matched_review' : 'matched_by_amount';
    rows.push({ ...base, status, matched_by: by === 'trace' ? 'trace' : 'amount_date', deposit_id: d.deposit_id, deposit_date: d.date, deposit_amount: d.amount, difference: diff, days_to_deposit: p.date && d.date ? daysBetween(p.date, d.date) : null, note: status === 'amount_mismatch' ? 'Same trace number, different amount: the bank or the payer changed the amount (offset, levy, fee).' : status === 'matched_review' ? 'More than one deposit has this amount in the window; check it is the right one.' : '' });
  }
  const payerNames = [...new Set(payments.map((p) => p.payer).filter(Boolean))];
  const unmatched = deps.filter((d) => !d.used).map((d) => {
    const lp = likelyPayer(d, payerNames, aliases);
    const insurance = !!lp || INSURANCE_HINT.test(`${str(d.description)} ${str(d.payer)}`);
    return { deposit_id: d.deposit_id, date: d.date, amount: d.amount, description: str(d.description).slice(0, 160), trace_numbers: d.traces, likely_payer: lp ? lp.payer : null, payer_by: lp ? lp.by : null, ...(lp && lp.fact_id ? { fact_id: lp.fact_id } : {}), status: insurance ? 'deposit_without_era' : 'not_insurance', note: insurance ? 'Money arrived without a remittance: ask the payer (or clearinghouse) for the 835.' : 'Does not look like an insurance payment; left for the bookkeeper.' };
  });
  const sumBy = (xs, f) => round2(xs.reduce((s, x) => s + (Number(f(x)) || 0), 0));
  const ok = rows.filter((r) => r.status.startsWith('matched'));
  return {
    payments: rows.length, matched: ok.length, need_review: rows.filter((r) => ['matched_review', 'amount_mismatch', 'no_deposit'].includes(r.status)).length,
    era_total: sumBy(rows, (r) => r.era_amount), deposited_and_matched: sumBy(ok, (r) => r.deposit_amount),
    no_deposit_total: sumBy(rows.filter((r) => r.status === 'no_deposit'), (r) => r.era_amount),
    mismatch_total: sumBy(rows.filter((r) => r.status === 'amount_mismatch'), (r) => r.difference),
    deposits_without_era: unmatched.filter((d) => d.status === 'deposit_without_era').length,
    deposits_without_era_total: sumBy(unmatched.filter((d) => d.status === 'deposit_without_era'), (d) => d.amount),
    by_status: rows.reduce((m, r) => { m[r.status] = (m[r.status] || 0) + 1; return m; }, {}),
    rows, unmatched_deposits: unmatched,
  };
}

/** Provider-level adjustments explained. A positive PLB amount reduces the payment; a negative one adds to it. */
export function explainPlb(plb) {
  const items = plb.map((x) => ({ ...x, meaning: PLB_REASONS[str(x.reason).toUpperCase()] || 'Not in Fennel\'s list', effect: x.amount > 0 ? 'reduced the payment' : 'added to the payment',
    next_step: /^(WO|WU|FB|72|J1|B3)$/i.test(x.reason) ? 'Find the claim in the reference and check the recovery is right; post it against that claim, not as unapplied cash.' : /^(L6|51|50)$/i.test(x.reason) ? 'Post as interest income.' : /^(LE|IR|SL|E3)$/i.test(x.reason) ? 'Levy or withholding: forward to the practice owner or accountant.' : 'Post per your policy; ask the payer if unclear.' }));
  return { items, reduced: round2(items.filter((x) => x.amount > 0).reduce((s, x) => s + x.amount, 0)), added: round2(-items.filter((x) => x.amount < 0).reduce((s, x) => s + x.amount, 0)), by_reason: items.reduce((m, x) => { m[x.reason] = round2((m[x.reason] || 0) + x.amount); return m; }, {}) };
}
