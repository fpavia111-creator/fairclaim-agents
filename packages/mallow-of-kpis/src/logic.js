// Mallow logic: revenue cycle KPIs from claims and remittances, against the practice's own targets. No I/O.
import { str, sum, pct, round2, daysBetween, bucketOf, payerKey, allAdjustments, categorise, denialLines, DENIAL_CATEGORIES } from 'remedy-core';

/** Each KPI: which way is good, and how it is computed (shown in every result). */
export const KPIS = Object.freeze({
  denial_rate: { better: 'lower', unit: '%', how: 'Adjudicated claims whose first remittance carried a denial (any adjustment that is not a contractual write-down or patient cost-sharing), as a share of adjudicated claims.' },
  denied_amount_rate: { better: 'lower', unit: '%', how: 'Denied dollars on first remittances as a share of the charges on those claims.' },
  first_pass_rate: { better: 'higher', unit: '%', how: 'Adjudicated claims settled by one remittance with no denial, as a share of adjudicated claims.' },
  net_collection_rate: { better: 'higher', unit: '%', how: 'Payer payments as a share of what the payer owed: charges less contractual write-downs and patient responsibility. Payer share only; patient payments are not in these files.' },
  median_days_to_pay: { better: 'lower', unit: 'days', how: 'Median days from the submitted date (else the date of service) to the first remittance that paid.' },
  days_in_ar: { better: 'lower', unit: 'days', how: 'Insurance A/R on the as-of date (charges less payer payments, write-downs and patient responsibility) divided by average daily charges over the period.' },
  no_response_rate: { better: 'lower', unit: '%', how: 'Claims with no remittance more than the no-response days after they were sent, as a share of claims sent before that.' },
});
export const TARGET_KEYS = Object.freeze(Object.keys(KPIS));
const pctOrNull = (a, b) => (b ? pct(a, b) : null);
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : round2((s[m - 1] + s[m]) / 2); };
const p90 = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(0.9 * s.length) - 1)]; };

/** Money on one remit claim: payer paid, patient responsibility, contractual write-down, denied. */
function remitMoney(r) {
  let writedown = 0; let pr = 0;
  for (const a of allAdjustments(r)) {
    if (a.group === 'PR') { pr += a.amount || 0; continue; }
    const info = categorise(a, { payer: r.payer });
    if (info.category === 'not_denial' && a.group !== 'CR') writedown += a.amount || 0;
  }
  const denials = denialLines([r]).filter((d) => d.group !== 'PR');
  return { paid: r.paid || 0, pr: round2(pr || r.patient_responsibility || 0), writedown: round2(writedown), denied: sum(denials, (d) => d.amount), denials };
}

/**
 * claims: grouped claims (readClaims). remits: remit claims (readRemits().claims).
 * config: { as_of, period_days, no_response_days, targets: { kpi: number } }. facts: payer_kpi_watch.
 */
export function computeKpis(claims, remits, { config = {}, facts = [], asOf = null } = {}) {
  const byId = new Map(); for (const r of remits) { const k = str(r.claim_id).toUpperCase(); if (!byId.has(k)) byId.set(k, []); byId.get(k).push(r); }
  const known = new Set(claims.map((c) => str(c.claim_id).toUpperCase()));
  const unmatched = [...byId.keys()].filter((k) => !known.has(k));
  const dates = [...claims.map((c) => c.submitted_date || c.service_from), ...remits.map((r) => r.payment_date)].filter(Boolean).sort();
  const as_of = asOf || config.as_of || dates.at(-1) || null;
  const periodDays = config.period_days || 90; const noResp = config.no_response_days || 30;
  const rows = claims.map((c) => {
    const rs = (byId.get(str(c.claim_id).toUpperCase()) || []).filter((r) => !as_of || !r.payment_date || r.payment_date <= as_of).sort((a, b) => str(a.payment_date).localeCompare(str(b.payment_date)));
    const charge = c.lines_total ?? c.total_charge ?? sum(c.lines || [], (l) => l.charge);
    const sent = c.submitted_date || null; const service = c.service_from || (c.lines || []).map((l) => l.date_from).filter(Boolean).sort()[0] || null;
    const start = sent || service;
    const money = rs.map(remitMoney);
    const first = money[0] || null;
    const paidDate = rs.find((r) => (r.paid || 0) > 0)?.payment_date || null;
    const paid = sum(money, (m) => m.paid); const wd = sum(money, (m) => m.writedown); const pr = sum(money, (m) => m.pr);
    return {
      claim_id: c.claim_id, patient_name: c.patient_name, payer: c.payer_name || rs[0]?.payer || null, provider: c.provider || c.rendering_npi || null,
      service_date: service, submitted_date: sent, start_from: sent ? 'submitted' : 'service', charge: round2(charge || 0),
      remits: rs.length, adjudicated: rs.length > 0, denied_first: !!first && (first.denials.length > 0 || str(rs[0].status) === '4'),
      denied_amount_first: first ? first.denied : 0, first_pass: rs.length === 1 && first.denials.length === 0 && str(rs[0].status) !== '4',
      paid, writedown: wd, patient_responsibility: pr, owed_by_payer: round2((charge || 0) - wd - pr),
      first_paid_date: paidDate, days_to_pay: paidDate && start ? daysBetween(start, paidDate) : null,
      ar_balance: round2(Math.max(0, (charge || 0) - paid - wd - pr)), days_open: !rs.length && start && as_of ? daysBetween(start, as_of) : null,
      denial_reasons: first ? [...new Set(first.denials.map((d) => `${d.group}-${d.reason}`))] : [],
    };
  }).filter((r) => !as_of || !r.service_date || r.service_date <= as_of);
  const measure = (rs) => {
    const adj = rs.filter((r) => r.adjudicated); const dtp = adj.map((r) => r.days_to_pay).filter((d) => d !== null);
    const recent = rs.filter((r) => r.service_date && as_of && daysBetween(r.service_date, as_of) < periodDays);
    const daily = sum(recent, (r) => r.charge) / periodDays;
    const due = rs.filter((r) => r.submitted_date || r.service_date).filter((r) => as_of && daysBetween(r.submitted_date || r.service_date, as_of) > noResp);
    const ar = sum(rs, (r) => r.ar_balance);
    return {
      claims: rs.length, charges: sum(rs, (r) => r.charge), adjudicated: adj.length, paid: sum(adj, (r) => r.paid), ar_balance: ar,
      denial_rate: pctOrNull(adj.filter((r) => r.denied_first).length, adj.length),
      denied_amount_rate: pctOrNull(sum(adj, (r) => r.denied_amount_first), sum(adj, (r) => r.charge)),
      first_pass_rate: pctOrNull(adj.filter((r) => r.first_pass).length, adj.length),
      net_collection_rate: pctOrNull(sum(adj, (r) => r.paid), sum(adj, (r) => r.owed_by_payer)),
      median_days_to_pay: median(dtp), p90_days_to_pay: p90(dtp),
      days_in_ar: daily > 0 ? round2(ar / daily) : null,
      no_response_rate: pctOrNull(due.filter((r) => !r.adjudicated).length, due.length),
      open_claims: rs.filter((r) => !r.adjudicated).length,
    };
  };
  const overall = measure(rows);
  const targets = config.targets || {};
  const judge = (k, v, t) => (v === null || t === undefined || t === null ? null : KPIS[k].better === 'lower' ? v <= t : v >= t);
  const kpis = Object.fromEntries(TARGET_KEYS.map((k) => [k, { value: overall[k], unit: KPIS[k].unit, target: targets[k] ?? null, better: KPIS[k].better, met: judge(k, overall[k], targets[k]), how: KPIS[k].how }]));
  const fmt = (k, v) => (v === null ? 'n/a' : `${v}${KPIS[k].unit === '%' ? '%' : ' days'}`);
  const alerts = [];
  for (const [k, x] of Object.entries(kpis)) if (x.met === false) alerts.push({ scope: 'overall', payer: null, kpi: k, value: x.value, target: x.target, source: 'config', message: `${k.replace(/_/g, ' ')} is ${fmt(k, x.value)}; your target is ${KPIS[k].better === 'lower' ? 'at most' : 'at least'} ${fmt(k, x.target)}.` });
  const group = (key) => {
    const m = new Map(); for (const r of rows) { const g = key(r) ?? 'unknown'; if (!m.has(g)) m.set(g, []); m.get(g).push(r); }
    return [...m.entries()].map(([g, rs]) => ({ group: g, ...measure(rs) })).sort((a, b) => b.charges - a.charges || String(a.group).localeCompare(String(b.group)));
  };
  const by_payer = group((r) => r.payer);
  for (const f of facts) {
    const v = f.value; const hit = by_payer.find((p) => payerKey(p.group) === payerKey(v.payer)); if (!hit) continue;
    const val = hit[v.kpi]; const ok = judge(v.kpi, val, v.limit);
    if (ok === false) alerts.push({ scope: 'payer', payer: hit.group, kpi: v.kpi, value: val, target: v.limit, source: 'memory', fact_id: f.id, message: `${hit.group}: ${v.kpi.replace(/_/g, ' ')} is ${fmt(v.kpi, val)}; your watch is ${KPIS[v.kpi].better === 'lower' ? 'at most' : 'at least'} ${fmt(v.kpi, v.limit)}${v.note ? ` (${v.note})` : ''}.` });
  }
  const open = rows.filter((r) => !r.adjudicated).map((r) => ({ claim_id: r.claim_id, patient_name: r.patient_name, payer: r.payer, provider: r.provider, service_date: r.service_date, submitted_date: r.submitted_date, charge: r.charge, days_open: r.days_open, bucket: bucketOf(r.days_open), overdue: r.days_open !== null && r.days_open > noResp }))
    .sort((a, b) => (b.days_open ?? -1) - (a.days_open ?? -1) || a.claim_id.localeCompare(b.claim_id));
  const overdue = open.filter((o) => o.overdue);
  if (overdue.length) alerts.push({ scope: 'overall', payer: null, kpi: 'no_response', value: overdue.length, target: noResp, source: 'rule', message: `${overdue.length} claim(s) worth ${sum(overdue, (o) => o.charge).toFixed(2)} have no remittance more than ${noResp} days after they were sent: check their status with the payer (${[...new Set(overdue.map((o) => o.payer))].join(', ')}).` });
  const den = remits.length ? denialLines(rows.filter((r) => r.adjudicated).map((r) => (byId.get(str(r.claim_id).toUpperCase()) || [])[0]).filter(Boolean)) : [];
  const cats = {}; for (const d of den) { const c = (cats[d.category] ||= { category: d.category, team: d.team, count: 0, amount: 0, claims: new Set() }); c.count++; c.amount = round2(c.amount + (d.amount || 0)); c.claims.add(d.claim_id); }
  const top_denials = Object.values(cats).map((c) => ({ ...c, claims: c.claims.size, next_step: (DENIAL_CATEGORIES[c.category] || DENIAL_CATEGORIES.unknown).next })).sort((a, b) => b.amount - a.amount || b.count - a.count);
  return {
    as_of, period_days: periodDays, no_response_days: noResp, ...overall, kpis, alerts,
    // Days in A/R needs a full period of charges, not one month, so it is left out per month.
    by_payer, by_month: group((r) => (r.service_date ? r.service_date.slice(0, 7) : null)).map((m) => ({ ...m, days_in_ar: null })).sort((a, b) => String(a.group).localeCompare(String(b.group))),
    by_provider: group((r) => r.provider),
    open_claims_by_bucket: Object.entries(open.reduce((m, o) => { (m[o.bucket] ||= { bucket: o.bucket, count: 0, amount: 0 }); m[o.bucket].count++; m[o.bucket].amount = round2(m[o.bucket].amount + o.charge); return m; }, {})).map(([, v]) => v),
    open, top_denials,
    data_notes: [
      ...(unmatched.length ? [`${unmatched.length} remittance claim(s) match no claim in the claims file (${unmatched.slice(0, 5).join(', ')}${unmatched.length > 5 ? ', ...' : ''}); they are left out.`] : []),
      ...(rows.some((r) => r.start_from === 'service') ? [`${rows.filter((r) => r.start_from === 'service').length} claim(s) have no submitted date; days are counted from the date of service for them.`] : []),
      ...(!Object.keys(targets).length ? ['No targets in your config: KPIs are shown without met or missed. Set your own targets in kpi_config.'] : []),
    ],
    claims_detail: rows,
  };
}
