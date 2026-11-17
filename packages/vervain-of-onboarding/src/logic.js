// Vervain logic: go-live readiness for a new practice (setup, roster, enrollments, payer IDs, fees). No I/O.
import { str, num, isoDate, daysBetween, npiProblem, payerKey } from 'remedy-core';

export const AREAS = Object.freeze(['practice', 'providers', 'enrollment', 'payers', 'fees']);
export const ENROLLMENTS = Object.freeze({ edi: '837 claim (EDI) enrollment', era: '835 ERA enrollment', eft: 'EFT enrollment', credentialing: 'credentialing / participation' });
const DONE = /^(approved|active|enrolled|complete|completed|done|live|yes|y|effective|accepted|participating|par|ok|n\/?a|not required)$/i;
const PENDING = /^(pending|submitted|in progress|in review|processing|sent|applied|awaiting.*)$/i;
const DENIED = /^(denied|rejected|declined|returned|terminated|closed)$/i;
export const statusOf = (v) => { const s = str(v); if (!s) return 'missing'; if (DONE.test(s)) return 'done'; if (PENDING.test(s)) return 'pending'; if (DENIED.test(s)) return 'denied'; return 'unknown'; };
export const taxonomyValid = (v) => /^\d{3}[0-9A-Z]{6}X$/.test(str(v).toUpperCase());
export const einValid = (v) => /^\d{2}-?\d{7}$/.test(str(v)) && !/^00/.test(str(v));
const poBox = (v) => /\b(p\.?\s*o\.?\s*box|post\s+office\s+box|pob\b|lock\s*box|lockbox)\b/i.test(str(v));
const NAME_KEYS = new Map();
const nameKey = (v) => { const s = str(v); let k = NAME_KEYS.get(s); if (k === undefined) { k = s.toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); if (NAME_KEYS.size > 50000) NAME_KEYS.clear(); NAME_KEYS.set(s, k); } return k; };

/**
 * setup: onboarding_config ({ practice, go_live, lead_days }). roster: [{ provider, npi, taxonomy, license_state, license_number }].
 * enrollments: [{ payer, payer_id, provider, edi, era, eft, credentialing, submitted_date, effective_date }].
 * fees: [{ code, modifier, fee }] or null. claims: grouped claims (readClaims) or [] (the charges the practice will bill).
 * facts: payer_lead_days ({ payer, days, note }).
 */
export function checkReadiness({ setup = {}, roster = [], enrollments = [], fees = null, claims = [], facts = [], asOf }) {
  const items = []; const add = (area, severity, subject, message, extra = {}) => items.push({ area, severity, subject, message, ...extra });
  const goLive = isoDate(setup.go_live) || null;
  const leadDefault = setup.lead_days ?? 30;
  const p = setup.practice || {};
  // Practice: billing provider (loop 2010AA) details.
  if (!p.name) add('practice', 'error', 'practice', 'No practice (billing provider) name in the setup.');
  const np = npiProblem(p.billing_npi);
  if (np) add('practice', 'error', 'billing NPI', `Billing NPI ${p.billing_npi || ''}: ${np}.`.replace(' :', ':'));
  else add('practice', 'info', 'billing NPI', `Billing NPI ${p.billing_npi} has a valid check digit. Confirm in NPPES that it is the group's (type 2) NPI, not a provider's.`);
  if (!p.tax_id) add('practice', 'error', 'tax ID', 'No tax ID (EIN) for the billing provider.');
  else if (!einValid(p.tax_id)) add('practice', 'error', 'tax ID', `Tax ID ${p.tax_id} is not a nine-digit EIN (NN-NNNNNNN).`);
  if (p.taxonomy && !taxonomyValid(p.taxonomy)) add('practice', 'error', 'taxonomy', `Group taxonomy ${p.taxonomy} is not ten characters ending in X.`);
  const a = p.address || {};
  if (!a.street || !a.city || !a.state || !a.zip) add('practice', 'error', 'billing address', 'The billing provider address needs street, city, state and ZIP.');
  if (poBox(a.street)) add('practice', 'error', 'billing address', `The billing provider address is a PO box (${a.street}): the 837 billing provider address must be a street address; put the PO box or lockbox in the pay-to address.`);
  if (a.zip && !/^\d{5}-?\d{4}$/.test(str(a.zip))) add('practice', 'error', 'billing address', `Billing provider ZIP ${a.zip} has five digits: the 837 billing provider address needs the full nine-digit ZIP.`);
  if (!goLive) add('practice', 'warning', 'go-live', 'No go-live date in the setup: enrollment timing cannot be checked.');
  // Providers.
  const seen = new Map();
  for (const r of roster) {
    const who = str(r.provider) || '(no name)';
    const e = npiProblem(r.npi); if (e) add('providers', 'error', who, `NPI ${r.npi || ''}: ${e}.`.replace(' :', ':'));
    if (str(r.npi) && str(r.npi) === str(p.billing_npi)) add('providers', 'error', who, `Uses the billing (group) NPI ${r.npi} as the rendering NPI.`);
    if (str(r.npi) && seen.has(str(r.npi))) add('providers', 'error', who, `NPI ${r.npi} is also on ${seen.get(str(r.npi))}.`);
    if (str(r.npi)) seen.set(str(r.npi), who);
    if (!str(r.taxonomy)) add('providers', 'warning', who, 'No taxonomy code: many payers want the rendering taxonomy on the claim.');
    else if (!taxonomyValid(r.taxonomy)) add('providers', 'error', who, `Taxonomy ${r.taxonomy} is not ten characters ending in X.`);
    if (!str(r.license_state)) add('providers', 'warning', who, 'No license state on the roster.');
  }
  // Enrollments: one row per payer, for the group (no provider) or one provider.
  const rosterKeys = new Map(roster.map((r) => [nameKey(r.provider), str(r.provider)]));
  const payers = new Map();
  for (const e of enrollments) {
    const pk = payerKey(e.payer); if (!pk) continue;
    if (!payers.has(pk)) payers.set(pk, { payer: str(e.payer), payer_ids: new Set(), rows: [] });
    const P = payers.get(pk); if (str(e.payer_id)) P.payer_ids.add(str(e.payer_id)); P.rows.push(e);
  }
  const lead = (payer) => { const f = facts.filter((x) => payerKey(x.value.payer) === payerKey(payer) && x.value.days >= leadDefault).sort((x, y) => y.value.days - x.value.days)[0]; return f ? { days: f.value.days, fact_id: f.id, note: f.value.note } : { days: leadDefault }; };
  const matrix = [];
  for (const P of payers.values()) {
    const group = P.rows.filter((r) => !str(r.provider));
    const row = { payer: P.payer, payer_id: [...P.payer_ids].join(' / ') || null, edi: 'missing', era: 'missing', eft: 'missing', providers_credentialed: 0, providers_listed: 0, providers_missing: [], ready: false };
    for (const k of ['edi', 'era', 'eft']) {
      const vals = P.rows.map((r) => statusOf(r[k])).filter((s) => s !== 'missing');
      row[k] = vals.includes('done') ? 'done' : vals.includes('pending') ? 'pending' : vals.includes('denied') ? 'denied' : vals[0] || 'missing';
      const src = P.rows.find((r) => statusOf(r[k]) === row[k]) || P.rows[0];
      const days = src && isoDate(src.submitted_date) && goLive ? daysBetween(src.submitted_date, goLive) : null;
      const L = lead(P.payer);
      if (row[k] === 'missing') add('enrollment', k === 'edi' ? 'error' : 'warning', P.payer, `${ENROLLMENTS[k]} not started${k === 'edi' ? ': claims cannot be sent to this payer electronically' : k === 'era' ? ': payments will come as paper remittances' : ': payments will come as paper checks'}.`, { payer: P.payer, enrollment: k });
      else if (row[k] === 'denied') add('enrollment', 'error', P.payer, `${ENROLLMENTS[k]} was ${str(src[k]).toLowerCase()}: find out why and resubmit.`, { payer: P.payer, enrollment: k });
      else if (row[k] === 'pending') {
        const late = days !== null && days < L.days;
        add('enrollment', k === 'edi' && late ? 'error' : 'warning', P.payer, `${ENROLLMENTS[k]} is pending${days !== null ? ` (submitted ${src.submitted_date}, ${days} day(s) before go-live)` : ''}${late ? `: your lead time for this payer is ${L.days} days${L.note ? ` (${L.note})` : ''}, so it may not be live by go-live` : ''}.`, { payer: P.payer, enrollment: k, ...(L.fact_id && late ? { fact_id: L.fact_id } : {}) });
      } else if (row[k] === 'unknown') add('enrollment', 'warning', P.payer, `${ENROLLMENTS[k]} status "${str(src[k])}" is not one Vervain knows: confirm it.`, { payer: P.payer, enrollment: k });
      if (row[k] === 'done' && goLive && src && isoDate(src.effective_date) && src.effective_date > goLive) add('enrollment', 'error', P.payer, `${ENROLLMENTS[k]} is effective ${src.effective_date}, after go-live on ${goLive}.`, { payer: P.payer, enrollment: k });
    }
    // Credentialing per provider; a group row counts for every provider only for payers the setup lists under group_contracts.
    const groupCred = (setup.group_contracts || []).some((g) => payerKey(g) === payerKey(P.payer)) && group.some((r) => statusOf(r.credentialing) === 'done');
    // Index this payer's rows once by provider name and NPI; the earliest row that matches either wins.
    const byName = new Map(); const byNpi = new Map();
    P.rows.forEach((x, i) => { const k = nameKey(x.provider); if (!byName.has(k)) byName.set(k, i); const n = str(x.npi); if (n && !byNpi.has(n)) byNpi.set(n, i); });
    for (const r of roster) {
      const hits = [byName.get(nameKey(r.provider)), str(r.npi) ? byNpi.get(str(r.npi)) : undefined].filter((i) => i !== undefined);
      const pr = hits.length ? P.rows[Math.min(...hits)] : undefined;
      row.providers_listed++;
      const st = pr ? statusOf(pr.credentialing) : groupCred ? 'done' : 'missing';
      if (st === 'done' && goLive && pr && isoDate(pr.effective_date) && pr.effective_date > goLive) {
        row.providers_missing.push(`${str(r.provider)} (effective ${pr.effective_date})`);
        add('enrollment', 'error', P.payer, `${str(r.provider)}: credentialing effective ${pr.effective_date}, after go-live on ${goLive}; claims for visits before that date may deny.`, { payer: P.payer, provider: str(r.provider), enrollment: 'credentialing' });
      } else if (st === 'done') row.providers_credentialed++;
      else {
        row.providers_missing.push(str(r.provider));
        add('enrollment', st === 'pending' ? 'warning' : 'error', P.payer, `${str(r.provider)}: credentialing ${st === 'missing' ? 'not on file for this payer' : st === 'pending' ? `pending${pr && isoDate(pr.submitted_date) ? ` since ${pr.submitted_date}` : ''}` : st === 'denied' ? str(pr.credentialing).toLowerCase() : `status "${str(pr.credentialing)}"`}: hold or reassign this provider's visits for this payer until it is done.`, { payer: P.payer, provider: str(r.provider), enrollment: 'credentialing' });
      }
    }
    for (const x of P.rows.filter((x) => str(x.provider) && !rosterKeys.has(nameKey(x.provider)))) add('providers', 'warning', str(x.provider), `Listed for ${P.payer} enrollment but not on the roster.`);
    if (!P.payer_ids.size) add('payers', 'error', P.payer, 'No clearinghouse payer ID: claims cannot be routed.', { payer: P.payer });
    if (P.payer_ids.size > 1) add('payers', 'warning', P.payer, `More than one payer ID (${[...P.payer_ids].join(', ')}): confirm which one your clearinghouse uses for claims.`, { payer: P.payer });
    row.ready = row.edi === 'done' && row.providers_missing.length === 0 && !items.some((i) => i.payer === P.payer && i.severity === 'error');
    matrix.push(row);
  }
  const idOwners = new Map(); for (const P of payers.values()) for (const id of P.payer_ids) { if (!idOwners.has(id)) idOwners.set(id, []); idOwners.get(id).push(P.payer); }
  for (const [id, names] of idOwners) if (names.length > 1) add('payers', 'warning', names.join(', '), `Payer ID ${id} is used for ${names.length} payers: check that it is not a copy-paste error.`);
  // Charges the practice will bill: payers and providers set up, codes with a fee.
  const feeBy = fees ? new Map(fees.map((f) => [`${str(f.code).toUpperCase()}|${str(f.modifier).toUpperCase()}`, num(f.fee)])) : null;
  const usedPayers = new Map(); const usedProv = new Map(); const usedCodes = new Map();
  for (const c of claims) {
    if (c.payer_name) usedPayers.set(payerKey(c.payer_name), (usedPayers.get(payerKey(c.payer_name)) || { name: c.payer_name, n: 0 })), usedPayers.get(payerKey(c.payer_name)).n++;
    const prov = c.provider || c.rendering_npi; if (prov) usedProv.set(nameKey(prov), (usedProv.get(nameKey(prov)) || { name: prov, npi: c.rendering_npi, n: 0 })), usedProv.get(nameKey(prov)).n++;
    for (const l of c.lines || []) if (l.code) usedCodes.set(l.code, (usedCodes.get(l.code) || 0) + 1);
  }
  for (const [k, u] of usedPayers) if (!payers.has(k)) add('payers', 'error', u.name, `${u.n} claim(s) in the charges go to ${u.name}, which has no enrollment row: enroll or confirm the payer name.`, { payer: u.name });
  const rosterNpis = new Set(roster.map((r) => str(r.npi)));
  for (const [k, u] of usedProv) if (!rosterKeys.has(k) && !rosterNpis.has(str(u.name)) && !(u.npi && rosterNpis.has(str(u.npi)))) add('providers', 'error', str(u.name), `${u.n} claim(s) in the charges are for ${u.name}, who is not on the roster.`);
  if (feeBy) {
    for (const f of fees) { const v = num(f.fee); if (v === null || v <= 0) add('fees', 'error', str(f.code), `Fee for ${f.code}${f.modifier ? `-${f.modifier}` : ''} is ${str(f.fee) || 'blank'}.`); }
    for (const [code, n] of usedCodes) if (![...feeBy.keys()].some((k) => k.startsWith(`${code.toUpperCase()}|`))) add('fees', 'error', code, `${code} is billed ${n} time(s) in the charges but has no fee in the fee schedule.`);
  } else if (claims.length) add('fees', 'warning', 'fee schedule', 'No fee schedule loaded: codes in the charges were not checked for a fee.');
  const order = { error: 0, warning: 1, info: 2 };
  items.sort((x, y) => order[x.severity] - order[y.severity] || AREAS.indexOf(x.area) - AREAS.indexOf(y.area) || x.subject.localeCompare(y.subject));
  const by_area = Object.fromEntries(AREAS.map((ar) => [ar, { errors: items.filter((i) => i.area === ar && i.severity === 'error').length, warnings: items.filter((i) => i.area === ar && i.severity === 'warning').length }]));
  const errors = items.filter((i) => i.severity === 'error').length;
  return {
    go_live: goLive, days_to_go_live: goLive && asOf ? daysBetween(asOf, goLive) : null, ready: errors === 0,
    errors, warnings: items.filter((i) => i.severity === 'warning').length, by_area,
    payers_ready: matrix.filter((m) => m.ready).length, payers: matrix.length, providers: roster.length, codes_billed: usedCodes.size,
    matrix, items,
  };
}
