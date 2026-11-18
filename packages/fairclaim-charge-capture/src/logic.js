// Fairclaim Charge Capture logic: charge capture (visits vs charges), charge lag and the E/M level mix. No I/O.
import { str, isoDate, daysBetween, round2, pct, isEm, normalizeName } from 'fairclaim-core';

const DONE = /complete|checked.?out|seen|arrived|checked.?in|closed|signed/i;
const CANCELLED = /cancel|no.?show|rescheduled|did not (come|arrive)|bumped|not seen|left without|\blwbs\b/i;
// "Not checked in" or "not arrived" is still a scheduled visit, not a completed one.
const isDone = (st) => DONE.test(st) && !/\bnot\b/i.test(st);
const NEW_EM = /^9920[2-5]$/;
const EST_EM = /^9921[1-5]$/;

/** True when a code matches a pattern list like ['20610', 'J*']. */
export const codeMatches = (code, patterns) => patterns.some((p) => (p.endsWith('*') ? str(code).toUpperCase().startsWith(p.slice(0, -1).toUpperCase()) : str(code).toUpperCase() === p.toUpperCase()));

const who = (x) => normalizeName(str(x.patient_name)).replace(/\s+/g, ' ').trim();
const visitKey = (x, date) => `${who(x)}|${date}`;

/**
 * appts: APPOINTMENT_FIELDS rows. claims: grouped claims (readClaims). config: { lag_days, expected: [{ visit_type, codes }], em_gap_points }.
 * facts: accepted visit_type_code memory facts. Returns { visits, charges_checked, rows, by_status, em_by_provider, ... }.
 */
export function reconcileCharges(appts, claims, { config = {}, facts = [], asOf } = {}) {
  const lag = Number.isFinite(config.lag_days) ? config.lag_days : 3;
  const expected = [...(config.expected || []).map((e) => ({ ...e, source: 'config' })), ...facts.map((f) => ({ ...f.value, source: 'memory', fact_id: f.id }))].filter((e) => Array.isArray(e.codes) && e.codes.length);
  const byId = new Map(claims.map((c) => [str(c.claim_id), c]));
  const byKey = new Map();
  for (const c of claims) { const d = c.lines.map((l) => l.date_from).find(Boolean); if (d) { const k = visitKey(c, d); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(c); } }
  const used = new Set(); const rows = [];
  for (const a of appts) {
    const id = str(a.appointment_id); const date = isoDate(a.date); const st = str(a.status);
    const claim = (str(a.claim_id) && byId.get(str(a.claim_id))) || byId.get(id) || (date && (byKey.get(visitKey(a, date)) || []).find((c) => !used.has(c.claim_id))) || null;
    if (claim) used.add(claim.claim_id);
    const base = { appointment_id: id, claim_id: claim ? claim.claim_id : null, patient_name: str(a.patient_name) || (claim && claim.patient_name) || null, date, provider: str(a.provider) || (claim && claim.provider) || null, visit_type: str(a.type) || null, visit_status: st || null, codes: claim ? claim.lines.map((l) => l.code).filter(Boolean) : [], charge: claim ? round2(claim.lines.reduce((s, l) => s + (l.charge || 0), 0)) : 0, days_since: date && asOf ? daysBetween(date, asOf) : null, entry_lag: null, status: 'matched', message: '', fix: '' };
    if (CANCELLED.test(st)) {
      if (claim) Object.assign(base, { status: 'charge_on_cancelled', message: `Visit is "${st}" but claim ${claim.claim_id} charges ${base.charge}.`, fix: 'Check whether the visit happened; void the charge if it did not.' });
      else continue;
    } else if (!isDone(st) && !claim) {
      continue; // still scheduled, nothing to reconcile
    } else if (!claim) {
      const late = base.days_since !== null && base.days_since > lag;
      Object.assign(base, { status: late ? 'missing_charge' : 'pending', message: late ? `Visit completed ${base.days_since} day(s) ago with no charge.` : `Visit completed ${base.days_since ?? '?'} day(s) ago; charge not entered yet (within ${lag} days).`, fix: late ? 'Ask the provider to close the note and enter the charge.' : '' });
    } else {
      const sub = claim.submitted_date; base.entry_lag = sub && date ? daysBetween(date, sub) : null;
      const exp = expected.find((e) => e.visit_type && base.visit_type && base.visit_type.toLowerCase().includes(String(e.visit_type).toLowerCase()) && !base.codes.some((c) => codeMatches(c, e.codes)));
      if (exp) Object.assign(base, { status: 'expected_code_missing', message: `Visit type "${base.visit_type}" usually bills ${exp.codes.join(' or ')}; the charge has ${base.codes.join(', ') || 'no code'}.${exp.note ? ` ${exp.note}` : ''}`, fix: 'Check the note for a service that was done but not charged.', ...(exp.fact_id ? { fact_id: exp.fact_id } : {}) });
      else if (base.entry_lag !== null && base.entry_lag > lag) Object.assign(base, { status: 'late_entry', message: `Charge billed ${base.entry_lag} day(s) after the visit (target ${lag}).`, fix: 'Find where the note or charge waited.' });
    }
    rows.push(base);
  }
  for (const c of claims) {
    if (used.has(c.claim_id)) continue;
    const d = c.lines.map((l) => l.date_from).find(Boolean) || null;
    rows.push({ appointment_id: null, claim_id: c.claim_id, patient_name: c.patient_name, date: d, provider: c.provider, visit_type: null, visit_status: null, codes: c.lines.map((l) => l.code).filter(Boolean), charge: round2(c.lines.reduce((s, l) => s + (l.charge || 0), 0)), days_since: d && asOf ? daysBetween(d, asOf) : null, entry_lag: null, status: 'charge_without_visit', message: `Claim ${c.claim_id} has no visit on the schedule${d ? ` for ${d}` : ''}.`, fix: 'Check the schedule (a walk-in or another location?) before billing.' });
  }
  const order = { missing_charge: 0, charge_on_cancelled: 1, charge_without_visit: 2, expected_code_missing: 3, late_entry: 4, pending: 5, matched: 6 };
  rows.sort((a, b) => order[a.status] - order[b.status] || (b.days_since ?? 0) - (a.days_since ?? 0));
  const by = rows.reduce((m, r) => { m[r.status] = (m[r.status] || 0) + 1; return m; }, {});
  const lags = rows.filter((r) => r.entry_lag !== null).map((r) => r.entry_lag).sort((a, b) => a - b);
  return {
    visits: rows.filter((r) => r.appointment_id).length, charges_checked: claims.length, by_status: by,
    need_action: rows.filter((r) => !['matched', 'pending'].includes(r.status)).length,
    median_entry_lag: lags.length ? lags[Math.floor((lags.length - 1) / 2)] : null,
    em_by_provider: emMix(claims, config), rows,
  };
}

/** E/M level mix per provider: share of level 4 and 5 against the rest of the group. */
export function emMix(claims, config = {}) {
  const gap = Number.isFinite(config.em_gap_points) ? config.em_gap_points : 20;
  const per = new Map();
  for (const c of claims) for (const l of c.lines) {
    if (!isEm(l.code) || !(NEW_EM.test(l.code) || EST_EM.test(l.code))) continue;
    const p = str(c.provider) || str(l.rendering_npi) || str(c.rendering_npi) || 'unknown';
    const x = per.get(p) || { provider: p, em_lines: 0, levels: {} }; per.set(p, x);
    x.em_lines++; const lv = l.code.slice(-1); x.levels[lv] = (x.levels[lv] || 0) + 1;
  }
  const all = [...per.values()];
  const high = (x) => (x.levels['4'] || 0) + (x.levels['5'] || 0);
  return all.map((x) => {
    const peers = all.filter((y) => y !== x); const pn = peers.reduce((s, y) => s + y.em_lines, 0);
    const share = pct(high(x), x.em_lines); const peer = pn ? pct(peers.reduce((s, y) => s + high(y), 0), pn) : null;
    const flag = peer !== null && x.em_lines >= 5 && Math.abs(share - peer) >= gap;
    return { ...x, level_4_5_share: share, peer_share: peer, differs: flag, note: flag ? `Level 4-5 share ${share}% against ${peer}% for peers: review a sample of notes. A difference is not an error by itself.` : (x.em_lines < 5 ? 'Too few E/M lines to compare.' : '') };
  }).sort((a, b) => b.em_lines - a.em_lines);
}
