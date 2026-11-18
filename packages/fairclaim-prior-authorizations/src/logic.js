// Fairclaim Prior Authorizations logic: services against the prior-authorization log and 278 responses. No I/O.
import { str, num, isoDate, daysBetween, payerKey } from 'fairclaim-core';

const norm = (v) => str(v).toUpperCase().replace(/[^A-Z0-9]/g, '');
const codeMatch = (patterns, code) => (patterns || []).some((p) => { const s = str(p).toUpperCase(); return s.endsWith('*') ? str(code).toUpperCase().startsWith(s.slice(0, -1)) : s === str(code).toUpperCase(); });
const codesOf = (v) => (Array.isArray(v) ? v : str(v).split(/[\s,;|]+/)).map((x) => str(x).toUpperCase()).filter(Boolean);

/** A log status in the words people use, read as approved, pending, denied or cancelled. */
export function logStatus(v) {
  const s = str(v).toLowerCase().trim();
  if (!s) return 'approved';
  if (/not (certified|approved|authori[sz]ed)|denied|declined|reject/.test(s)) return 'denied';
  if (/cancel|void|withdrawn|rescinded/.test(s)) return 'cancelled';
  if (/pend|review|submitted|requested|in process|waiting|awaiting|open/.test(s)) return 'pending';
  if (/approv|certif|authori[sz]ed|active|granted|partial|modified/.test(s)) return 'approved';
  return 'pending'; // an unknown word is never taken as an approval
}

/** Authorizations from the log rows and from certified 278 reviews, one list. */
export function authList(rows = [], reviews = []) {
  const byNum = new Map();
  const out = rows.map((r, i) => ({ auth_number: str(r.auth_number), member_id: str(r.member_id) || null, patient_name: str(r.patient_name) || null, payer: str(r.payer) || null, codes: codesOf(r.codes), units: num(r.units), from: isoDate(r.from), to: isoDate(r.to), status: logStatus(r.status), status_text: str(r.status) || null, source: 'log', row: i + 1 }));
  for (const a of out) { const k = norm(a.auth_number); if (k && !byNum.has(k)) byNum.set(k, a); }
  for (const v of reviews) {
    const st = { certified: 'approved', certified_partial: 'approved', modified: 'approved', pended: 'pending', not_certified: 'denied', cancelled: 'cancelled' }[v.decision] || 'pending';
    const known = v.auth_number && byNum.get(norm(v.auth_number));
    if (known) {
      known.status = st; known.review = v.decision;
      // The payer's decision is the record: approved units and dates in the 278 replace the ones typed in the log.
      if (st === 'approved') { if (Number.isFinite(v.units)) known.units = v.units; if (v.from) known.from = v.from; if (v.to) known.to = v.to; }
      continue;
    }
    out.push({ auth_number: v.auth_number || `278:${v.trace}`, member_id: v.member_id, patient_name: v.patient_name, payer: null, codes: v.codes.map((c) => c.toUpperCase()), units: v.units, from: v.from, to: v.to, status: st, source: '278', review: v.decision, trace: v.trace });
  }
  return out;
}

/**
 * Check each service line that needs an authorization.
 * claims: read837/groupClaims claims; rules: { payers: [{ name, codes }], warn_days }; facts: accepted payer_auth_rule facts.
 */
export function checkAuths(claims, auths, { rules = {}, facts = [], asOf } = {}) {
  const need = (payer, code) => (rules.payers || []).some((p) => payerKey(p.name) === payerKey(payer) && codeMatch(p.codes, code)) || facts.some((f) => payerKey(f.value.payer) === payerKey(payer) && codeMatch(f.value.codes, code));
  const factFor = (payer, code) => facts.find((f) => payerKey(f.value.payer) === payerKey(payer) && codeMatch(f.value.codes, code));
  // Index the log once: by member id, and by patient name (for rows or claims without one).
  const idx = new Map(); const pos = new Map(auths.map((a, i) => [a, i]));
  const put = (k, a) => { if (!idx.has(k)) idx.set(k, []); idx.get(k).push(a); };
  for (const a of auths) { const nm = str(a.patient_name).toLowerCase(); put(`n|${nm}`, a); if (a.member_id) put(`m|${norm(a.member_id)}`, a); else put(`x|${nm}`, a); }
  const numOf = new Map(auths.map((a) => [a, norm(a.auth_number)])); const pkOf = new Map(auths.map((a) => [a, a.payer ? payerKey(a.payer) : null]));
  // Candidate lists are cached by (member, name, payer) and by code, so many lines for the same patient share one lookup.
  const merge = (x, y) => { const out = []; let i = 0; let j = 0; while (i < x.length || j < y.length) out.push(j >= y.length || (i < x.length && pos.get(x[i]) < pos.get(y[j])) ? x[i++] : y[j++]); return out; };
  const mineCache = new Map(); const codeCache = new Map();
  const mineFor = (c, pk) => {
    const nm = str(c.patient_name).toLowerCase(); const mem = c.member_id ? norm(c.member_id) : '';
    const key = `${mem}|${nm}|${pk}`; let hit = mineCache.get(key);
    if (!hit) {
      const all = mem ? merge(idx.get(`m|${mem}`) || [], idx.get(`x|${nm}`) || []) : idx.get(`n|${nm}`) || [];
      hit = { key, list: all.filter((a) => !pkOf.get(a) || pkOf.get(a) === pk) }; mineCache.set(key, hit);
    }
    return hit;
  };
  const forCodeOf = (m, code) => { const k = `${m.key}|${code}`; let hit = codeCache.get(k); if (!hit) { hit = m.list.filter((a) => !a.codes.length || codeMatch(a.codes, code)); codeCache.set(k, hit); } return hit; };
  const used = new Map();
  const items = [];
  const lines = claims.flatMap((c) => c.lines.map((l) => ({ c, l }))).sort((a, b) => String(a.l.date_from).localeCompare(String(b.l.date_from)));
  for (const { c, l } of lines) {
    const payer = c.payer_name || c.payer; const code = str(l.code).toUpperCase();
    const onClaim = str(l.prior_auth) || str(c.prior_auth);
    const required = need(payer, code);
    if (!required && !onClaim) continue;
    const date = l.date_from;
    const m = mineFor(c, payerKey(payer)); const mine = m.list;
    const onNum = norm(onClaim); const byNumber = onClaim ? mine.find((a) => numOf.get(a) === onNum) : null;
    const forCode = forCodeOf(m, code);
    const inDates = forCode.filter((a) => (!a.from || a.from <= date) && (!a.to || a.to >= date));
    const auth = byNumber || inDates.find((a) => a.status === 'approved') || inDates[0] || forCode[0] || null;
    const it = { claim_id: c.claim_id, patient_name: c.patient_name, member_id: c.member_id, payer, date_of_service: date, code, units: Number(l.units) || 1, charge: l.charge, auth_on_claim: onClaim || null, auth_number: auth ? auth.auth_number : null, auth_from: auth ? auth.from : null, auth_to: auth ? auth.to : null, auth_units: auth ? auth.units : null, units_used: null, status: null, message: '', fix: '' };
    const lf = factFor(payer, code); if (lf && !(rules.payers || []).some((p) => payerKey(p.name) === payerKey(payer) && codeMatch(p.codes, code))) it.fact_id = lf.id;
    if (!auth && !required) Object.assign(it, { status: 'not_in_log', message: `The claim carries authorization ${onClaim}, which is not in the log for this patient.`, fix: 'Add the authorization to the log (or remove a number that does not belong on the claim).' });
    else if (!auth) { const other = mine.find((a) => a.status === 'approved' && a.codes.length && (!a.from || a.from <= date) && (!a.to || a.to >= date)); Object.assign(it, { status: 'missing', message: `${payer} needs prior authorization for ${code}; none on file for this patient${other ? ` (${other.auth_number} covers ${other.codes.join(', ')} only)` : ''}.`, fix: 'Get the authorization before the service, or reschedule. If it was done, add it to the log.' }); }
    else if (onClaim && !byNumber) Object.assign(it, { status: 'number_mismatch', message: `The claim carries ${onClaim}; the log has ${auth.auth_number} for this service.`, fix: 'Put the authorization number from the payer\'s approval on the claim (REF*G1).' });
    else if (auth.status === 'denied') Object.assign(it, { status: 'denied', message: `Authorization ${auth.auth_number} was not certified.`, fix: 'Do not bill as authorized: ask for peer-to-peer review or an appeal, or have the patient sign a waiver before the service.' });
    else if (auth.status === 'pending') Object.assign(it, { status: 'pending', message: `Authorization ${auth.auth_number} is pended with the payer.`, fix: 'Follow up with the payer before the service date.' });
    else if (auth.status === 'cancelled') Object.assign(it, { status: 'missing', message: `Authorization ${auth.auth_number} was cancelled.`, fix: 'Get a new authorization.' });
    else if (auth.codes.length && !codeMatch(auth.codes, code)) Object.assign(it, { status: 'code_not_on_auth', message: `${code} is not one of the codes on ${auth.auth_number} (${auth.codes.join(', ')}).`, fix: 'Ask the payer to add the code to the authorization before billing.' });
    else if (auth.from && date < auth.from) Object.assign(it, { status: 'not_started', message: `${auth.auth_number} starts ${auth.from}; the service is ${date}.`, fix: 'Move the visit, or ask the payer to backdate the authorization.' });
    else if (auth.to && date > auth.to) Object.assign(it, { status: 'expired', message: `${auth.auth_number} ended ${auth.to}; the service is ${date}.`, fix: 'Ask for an extension or a new authorization; services after the end date are usually denied.' });
    else {
      const key = norm(auth.auth_number); const u = (used.get(key) || 0) + it.units; used.set(key, u); it.units_used = u;
      if (auth.units !== null && u > auth.units) Object.assign(it, { status: 'units_exceeded', message: `${u} units used of ${auth.units} on ${auth.auth_number}.`, fix: 'Ask the payer for more units before the next visit; units past the approval are usually denied.' });
      else {
        const left = auth.to && asOf ? daysBetween(asOf, auth.to) : null; const warn = Number.isFinite(rules.warn_days) ? rules.warn_days : 14;
        const unitsLeft = auth.units !== null ? auth.units - u : null;
        if ((left !== null && left >= 0 && left <= warn) || (unitsLeft !== null && unitsLeft <= Math.max(1, Math.round(auth.units * 0.2)))) Object.assign(it, { status: 'running_out', message: `${auth.auth_number}: ${unitsLeft ?? '?'} unit(s) left, ends ${auth.to || 'no end date'}.`, fix: 'Request the extension now if more visits are planned.' });
        else Object.assign(it, { status: 'covered', message: `${auth.auth_number} covers it.` });
      }
    }
    items.push(it);
  }
  const by = items.reduce((m, i) => { m[i.status] = (m[i.status] || 0) + 1; return m; }, {});
  const bad = items.filter((i) => !['covered', 'running_out'].includes(i.status));
  const order = { missing: 0, denied: 1, expired: 2, units_exceeded: 3, code_not_on_auth: 4, number_mismatch: 5, not_started: 6, pending: 7, not_in_log: 8, running_out: 9, covered: 10 };
  return { lines_needing_auth: items.length, covered: by.covered || 0, at_risk: bad.length, charges_at_risk: Math.round(bad.reduce((s, i) => s + (i.charge || 0), 0) * 100) / 100, by_status: by, items: items.sort((a, b) => order[a.status] - order[b.status]) };
}
