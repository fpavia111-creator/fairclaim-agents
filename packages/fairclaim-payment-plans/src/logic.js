// Fairclaim Payment Plans logic: payment plan tracking against a schedule and policy, and plan options. No I/O.
import { str, num, round2, isoDate, addMonths, daysBetween, addDays } from 'fairclaim-core';

/** Due dates from the start month on the plan's day of month, up to and including `until`. */
export function dueDates(start, day, until) {
  const out = []; if (!start || !until) return out;
  const first = `${start.slice(0, 8)}${String(Math.min(day || Number(start.slice(8, 10)), 28)).padStart(2, '0')}`;
  let d = first < start ? addMonths(first, 1) : first;
  while (d <= until && out.length < 600) { out.push(d); d = addMonths(d, 1); }
  return out;
}

/** Longest term the policy allows for a balance: tiers [{ up_to, max_months }] sorted by up_to. */
export function maxMonths(balance, tiers = []) { const t = [...tiers].sort((a, b) => a.up_to - b.up_to).find((x) => balance <= x.up_to); return t ? t.max_months : (tiers.length ? Math.max(...tiers.map((x) => x.max_months)) : null); }

/**
 * plans: PLAN_FIELDS rows. payments: [{ plan_id, account, date, amount }].
 * config: { grace_days, default_after_missed, min_payment, tiers }. facts: accepted plan_grace facts.
 */
export function reviewPlans(plans, payments, { config = {}, facts = [], asOf } = {}) {
  const graceList = [Number.isFinite(config.grace_days) ? { d: config.grace_days, source: 'config' } : { d: 10, source: 'default' }, ...facts.map((f) => ({ d: f.value.grace_days, source: 'memory', fact_id: f.id }))];
  const grace = graceList.sort((a, b) => a.d - b.d)[0];
  const defAfter = Number.isFinite(config.default_after_missed) ? config.default_after_missed : 2;
  const minPay = Number.isFinite(config.min_payment) ? config.min_payment : null;
  const paidBy = new Map(); const lastBy = new Map();
  for (const p of payments) { const k = str(p.plan_id) || str(p.account); const a = num(p.amount) || 0; paidBy.set(k, (paidBy.get(k) || 0) + a); const d = isoDate(p.date); if (d && (!lastBy.get(k) || d > lastBy.get(k))) lastBy.set(k, d); }
  const items = plans.map((p) => {
    const id = str(p.plan_id); const acct = str(p.account); const orig = num(p.original_balance) ?? 0; const monthly = num(p.monthly_amount) ?? 0;
    const start = isoDate(p.start_date); const day = num(p.day_of_month);
    const counted = asOf ? addDays(asOf, -grace.d) : null;
    const dues = dueDates(start, day, counted);
    const paid = round2((paidBy.get(id) || 0) + (id !== acct ? paidBy.get(acct) || 0 : 0));
    const expected = round2(Math.min(dues.length * monthly, orig));
    const shortfall = round2(Math.max(0, expected - paid));
    const missed = monthly > 0 ? Math.floor(shortfall / monthly + 1e-9) : 0;
    const remaining = round2(Math.max(0, orig - paid));
    const term = monthly > 0 ? Math.ceil(orig / monthly) : null;
    const it = { plan_id: id || null, account: acct || null, patient_name: str(p.patient_name) || null, start_date: start, original_balance: orig, monthly_amount: monthly, installments_due: dues.length, expected_paid: expected, paid, shortfall, missed, remaining, months_left: monthly > 0 ? Math.ceil(remaining / monthly) : null, last_payment: lastBy.get(id) || lastBy.get(acct) || null, status: 'current', policy: [], message: '', grace_days: grace.d, ...(grace.fact_id ? { fact_id: grace.fact_id } : {}) };
    if (remaining <= 0) Object.assign(it, { status: 'paid_off', message: 'Paid in full: close the plan and send a paid-in-full letter.' });
    else if (missed >= defAfter) Object.assign(it, { status: 'default_review', message: `${missed} installment(s) missed (${shortfall} behind). Your policy reviews a plan after ${defAfter}: call the patient before anything else; a person decides.` });
    else if (missed >= 1) Object.assign(it, { status: 'missed_payment', message: `${missed} installment(s) missed (${shortfall} behind) after a ${grace.d}-day grace period: send a friendly reminder.` });
    else if (paid > expected + 0.005) Object.assign(it, { status: 'ahead', message: `Ahead by ${round2(paid - expected)}.` });
    else it.message = 'Current.';
    if (minPay !== null && monthly < minPay && remaining > 0) it.policy.push(`Monthly ${monthly} is below your minimum ${minPay}.`);
    const mm = maxMonths(orig, config.tiers || []);
    if (mm && term && term > mm && remaining > 0) it.policy.push(`Term of ${term} months is over your ${mm}-month limit for this balance.`);
    return it;
  });
  const order = { default_review: 0, missed_payment: 1, current: 2, ahead: 3, paid_off: 4 };
  items.sort((a, b) => order[a.status] - order[b.status] || b.shortfall - a.shortfall);
  const by = items.reduce((m, i) => { m[i.status] = (m[i.status] || 0) + 1; return m; }, {});
  return { plans: items.length, by_status: by, outside_policy: items.filter((i) => i.policy.length).length, remaining_total: round2(items.reduce((s, i) => s + i.remaining, 0)), behind_total: round2(items.reduce((s, i) => s + i.shortfall, 0)), grace_days: grace.d, items };
}

/** Plan options for a balance under the policy. */
export function planOptions(balance, { config = {} } = {}) {
  const min = Number.isFinite(config.min_payment) ? config.min_payment : 25;
  const mm = maxMonths(balance, config.tiers || []) ?? 12;
  const opts = [];
  for (const months of [3, 6, 12, 18, 24, 36, 48, 60]) {
    if (months > mm) break;
    const monthly = Math.ceil((balance / months) * 100) / 100;
    if (monthly < min) break;
    opts.push({ months, monthly, last_payment: round2(balance - monthly * (months - 1)) });
  }
  // The policy's own longest term, when it is not one of the standard lengths above.
  if (!opts.some((o) => o.months === mm) && mm > (opts.at(-1)?.months ?? 0) && mm > 1) { const monthly = Math.ceil((balance / mm) * 100) / 100; if (monthly >= min) opts.push({ months: mm, monthly, last_payment: round2(balance - monthly * (mm - 1)) }); }
  if (!opts.length) {
    // Never longer than the policy allows: a short limit raises the monthly amount instead.
    const atMin = Math.max(1, Math.ceil(balance / min)); const months = Math.max(1, Math.min(mm, atMin));
    // The minimum payment each month with a smaller last one; a shorter policy limit raises the monthly amount instead.
    const monthly = months === atMin ? Math.min(balance, min) : Math.ceil((balance / months) * 100) / 100;
    opts.push({ months, monthly, last_payment: round2(balance - monthly * (months - 1)) });
  }
  return { balance, min_payment: min, max_months: mm, options: opts };
}
