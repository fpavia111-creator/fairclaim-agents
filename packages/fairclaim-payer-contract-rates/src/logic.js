// Fairclaim Payer Contract Rates logic: payer rate comparison against Medicare and a contract renewal calendar. No I/O.
import { str, num, round2, pct, payerKey, isoDate, addDays, daysBetween } from 'fairclaim-core';

const yes = (v) => /^(y|yes|true|1|auto)$/i.test(str(v));

/**
 * payerFees: [{ payer, code, modifier, allowed }]. medicare: [{ code, modifier, amount }]. volumes: [{ code, volume }].
 * config: { floor_percent, payers: [{ name, floor_percent }] }. facts: accepted payer_rate_floor facts.
 */
export function compareRates(payerFees, { medicare = [], volumes = [], config = {}, facts = [] } = {}) {
  const key = (c, m) => `${str(c).toUpperCase()}|${str(m).toUpperCase()}`;
  const mc = new Map(medicare.map((r) => [key(r.code, r.modifier), num(r.amount)]));
  const vol = new Map(); for (const v of volumes) vol.set(key(v.code, v.modifier), (vol.get(key(v.code, v.modifier)) || 0) + (num(v.volume) || 0));
  const floorFor = (payer) => {
    const list = [{ p: Number.isFinite(config.floor_percent) ? config.floor_percent : null, source: 'config' }, ...(config.payers || []).filter((x) => payerKey(x.name) === payerKey(payer)).map((x) => ({ p: x.floor_percent, source: 'config' })), ...facts.filter((f) => payerKey(f.value.payer) === payerKey(payer)).map((f) => ({ p: f.value.percent_of_medicare, source: 'memory', fact_id: f.id }))].filter((x) => Number.isFinite(x.p));
    return list.sort((a, b) => b.p - a.p)[0] || null; // the highest floor wins: memory only adds checks
  };
  const payers = new Map(); const codes = new Map(); const lines = [];
  for (const r of payerFees) {
    const payer = str(r.payer); const code = str(r.code).toUpperCase(); const allowed = num(r.allowed); if (!payer || !code || allowed === null) continue;
    const k = key(code, r.modifier); const pc = ['26', 'TC'].includes(str(r.modifier).toUpperCase()); // a component rate is never compared with the global amount
    const m = mc.get(k) ?? (pc ? null : mc.get(key(code, ''))) ?? null; const v = vol.get(k) ?? vol.get(key(code, '')) ?? 0;
    const floor = floorFor(payer);
    const p = m ? pct(allowed, m) : null;
    const below = floor && p !== null && p < floor.p;
    const line = { payer, code, modifier: str(r.modifier).toUpperCase() || null, allowed, medicare: m, percent_of_medicare: p, volume: v, floor_percent: floor ? floor.p : null, below_floor: Boolean(below), gap_to_floor: below ? round2((m * floor.p / 100 - allowed) * (v || 0)) : 0, ...(below && floor.fact_id ? { fact_id: floor.fact_id } : {}) };
    lines.push(line);
    const P = payers.get(payer) || { payer, codes: 0, weighted_allowed: 0, weighted_medicare: 0, below_floor: 0, gap_to_floor: 0 }; payers.set(payer, P);
    P.codes++; if (m && v) { P.weighted_allowed += allowed * v; P.weighted_medicare += m * v; } if (below) { P.below_floor++; P.gap_to_floor += line.gap_to_floor; }
    const C = codes.get(code) || { code, volume: v, medicare: m, rates: {} }; codes.set(code, C); C.rates[payer] = allowed;
  }
  const payerRows = [...payers.values()].map((P) => ({ payer: P.payer, codes: P.codes, percent_of_medicare: P.weighted_medicare ? pct(P.weighted_allowed, P.weighted_medicare) : null, below_floor: P.below_floor, gap_to_floor: round2(P.gap_to_floor), yearly_at_volume: round2(P.weighted_allowed) })).sort((a, b) => (b.percent_of_medicare ?? -1) - (a.percent_of_medicare ?? -1));
  const codeRows = [...codes.values()].map((C) => { const e = Object.entries(C.rates).sort((a, b) => b[1] - a[1]); return { code: C.code, volume: C.volume, medicare: C.medicare, best_payer: e[0][0], best: e[0][1], worst_payer: e.at(-1)[0], worst: e.at(-1)[1], spread: round2(e[0][1] - e.at(-1)[1]), rates: C.rates }; }).sort((a, b) => b.spread * (b.volume || 1) - a.spread * (a.volume || 1));
  return { payers: payerRows, codes: codeRows, lines: lines.sort((a, b) => Number(b.below_floor) - Number(a.below_floor) || b.gap_to_floor - a.gap_to_floor), below_floor: lines.filter((l) => l.below_floor).length, gap_to_floor: round2(lines.reduce((s, l) => s + l.gap_to_floor, 0)), no_medicare: [...new Set(lines.filter((l) => l.medicare === null).map((l) => l.code))] };
}

/** contracts: CONTRACT_FIELDS rows. Returns the renewal calendar, soonest action first. */
export function contractCalendar(contracts, { asOf, warnDays = 120 } = {}) {
  const rows = contracts.map((c) => {
    const end = isoDate(c.end_date); const notice = num(c.notice_days) ?? 0; const auto = yes(c.auto_renew);
    const deadline = end ? addDays(end, -notice) : null; const left = deadline && asOf ? daysBetween(asOf, deadline) : null; const toEnd = end && asOf ? daysBetween(asOf, end) : null;
    let status = 'active'; let next = 'Nothing due.';
    if (!end) { status = 'no_end_date'; next = 'No end date recorded: check the contract term and notice clause.'; }
    else if (toEnd < 0 && !auto) { status = 'expired'; next = `Ended ${end} and does not renew by itself: check whether you are still in network and at what rates.`; }
    else if (left < 0 && auto) { status = 'renews_automatically'; next = toEnd < 0 ? `The term ended ${end} and renewed by itself on the same terms: record the new end date so the next notice deadline is tracked.` : `The notice deadline (${deadline}) has passed; it renews ${addDays(end, 1)} on the same terms. Mark the next deadline now.`; }
    else if (left < 0) { status = 'notice_passed'; next = `The notice deadline (${deadline}) has passed and it ends ${end}: talk to the payer now.`; }
    else if (left <= warnDays) { status = 'notice_window'; next = `${left} day(s) left to give notice or ask for new rates (deadline ${deadline}).`; }
    return { payer: str(c.payer), effective_date: isoDate(c.effective_date), end_date: end, auto_renew: auto, notice_days: notice, notice_deadline: deadline, days_to_deadline: left, escalator_percent: num(c.escalator_percent), timely_days: num(c.timely_days), appeal_days: num(c.appeal_days), status, next_step: next };
  });
  const order = { notice_window: 0, notice_passed: 1, expired: 2, renews_automatically: 3, no_end_date: 4, active: 5 };
  return rows.sort((a, b) => order[a.status] - order[b.status] || (a.days_to_deadline ?? 1e9) - (b.days_to_deadline ?? 1e9));
}
