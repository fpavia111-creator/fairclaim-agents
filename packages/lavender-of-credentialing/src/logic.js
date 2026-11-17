// Lavender logic: credentialing documents and payer enrollment tasks with due dates. No I/O.
import { str, isoDate, addDays, daysBetween, payerKey, npiProblem } from 'remedy-core';

export const DOCS = Object.freeze({ license_expires: 'State license', dea_expires: 'DEA registration', board_expires: 'Board certification', malpractice_expires: 'Malpractice insurance', caqh_due: 'CAQH re-attestation' });

/**
 * roster: ROSTER_FIELDS rows. enrollments: ENROLLMENT_FIELDS rows.
 * config: { warn_days, caqh_days, pending_followup_days, payers: [{ name, lead_days }], required_docs }. facts: payer_lead_days.
 */
export function credentialingTasks(roster, enrollments, { config = {}, facts = [], asOf } = {}) {
  const warn = Number.isFinite(config.warn_days) ? config.warn_days : 90;
  const caqh = Number.isFinite(config.caqh_days) ? config.caqh_days : 120;
  const follow = Number.isFinite(config.pending_followup_days) ? config.pending_followup_days : 30;
  const required = config.required_docs || ['license_expires', 'malpractice_expires'];
  const leadFor = (payer) => { const vals = [{ d: warn, source: 'config' }, ...(config.payers || []).filter((p) => payerKey(p.name) === payerKey(payer) && Number.isFinite(p.lead_days)).map((p) => ({ d: p.lead_days, source: 'config' })), ...facts.filter((f) => payerKey(f.value.payer) === payerKey(payer)).map((f) => ({ d: f.value.lead_days, source: 'memory', fact_id: f.id }))]; return vals.sort((a, b) => b.d - a.d)[0]; }; // the longest lead time wins: warnings only come earlier
  const tasks = []; const providers = [];
  const add = (t) => tasks.push({ provider: null, npi: null, payer: null, item: null, due: null, days_left: null, status: 'ok', message: '', ...t });
  for (const r of roster) {
    const p = { provider: str(r.provider), npi: str(r.npi) || null };
    providers.push(p);
    const np = npiProblem(r.npi); if (np) add({ ...p, item: 'NPI', status: 'error', message: `NPI ${np}.` });
    const docs = { license_expires: isoDate(r.license_expires), dea_expires: isoDate(r.dea_expires), board_expires: isoDate(r.board_expires), malpractice_expires: isoDate(r.malpractice_expires), caqh_due: isoDate(r.caqh_attested) ? addDays(isoDate(r.caqh_attested), caqh) : null };
    for (const [k, due] of Object.entries(docs)) {
      if (!due) { if (required.includes(k) || (k === 'caqh_due' && config.caqh !== false)) add({ ...p, item: DOCS[k], status: 'missing', message: `${DOCS[k]}: no date on file.` }); continue; }
      const left = asOf ? daysBetween(asOf, due) : null;
      const status = left !== null && left < 0 ? 'expired' : left !== null && left <= warn ? 'due_soon' : 'ok';
      add({ ...p, item: DOCS[k], due, days_left: left, status, message: status === 'expired' ? `${DOCS[k]} ${k === 'caqh_due' ? 'was due' : 'expired'} ${due}: ${k === 'caqh_due' ? 're-attest now; payers may stop claims' : 'the provider must not work under it until renewed'}.` : status === 'due_soon' ? `${DOCS[k]} ${k === 'caqh_due' ? 'is due' : 'expires'} ${due} (${left} day(s)): start the renewal.` : `${DOCS[k]} good until ${due}.` });
    }
  }
  for (const e of enrollments) {
    const st = str(e.status).toLowerCase(); const sub = isoDate(e.submitted_date); const eff = isoDate(e.effective_date); const reval = isoDate(e.revalidation_due);
    const base = { provider: str(e.provider), npi: str(e.npi) || null, payer: str(e.payer), item: 'Enrollment' };
    const lead = leadFor(base.payer); const ref = lead.fact_id ? { fact_id: lead.fact_id } : {};
    if (/denied|reject/.test(st)) add({ ...base, status: 'denied', message: 'Enrollment denied: read the letter, fix the reason and reapply or appeal.' });
    else if (/not started|^$|to do|none/.test(st) && !sub) add({ ...base, status: 'not_started', message: 'Not enrolled and no application sent: claims to this payer will deny (or pay out of network).' });
    else if (/pending|submitted|in process|processing/.test(st)) { const age = sub && asOf ? daysBetween(sub, asOf) : null; add({ ...base, due: sub ? addDays(sub, follow) : null, days_left: age !== null ? follow - age : null, status: age !== null && age > follow ? 'follow_up' : 'pending', message: age !== null && age > follow ? `Pending ${age} days since ${sub}: call the payer and record the reference.` : `Pending since ${sub || '?'}.` }); }
    else if (eff && asOf && eff > asOf) add({ ...base, due: eff, days_left: daysBetween(asOf, eff), status: 'not_yet_effective', message: `Effective ${eff}: do not bill this payer for this provider's visits before then.` });
    if (reval) { const left = asOf ? daysBetween(asOf, reval) : null; add({ ...base, item: 'Revalidation', due: reval, days_left: left, status: left !== null && left < 0 ? 'expired' : left !== null && left <= lead.d ? 'due_soon' : 'ok', message: left !== null && left < 0 ? `Revalidation was due ${reval}: billing privileges may be deactivated.` : left !== null && left <= lead.d ? `Revalidation due ${reval} (${left} day(s); ${lead.d}-day lead${lead.source === 'memory' ? ' from memory' : ''}).` : `Revalidation due ${reval}.`, ...ref }); }
  }
  const order = { error: 0, expired: 1, denied: 2, not_started: 3, follow_up: 4, missing: 5, due_soon: 6, not_yet_effective: 7, pending: 8, ok: 9 };
  tasks.sort((a, b) => order[a.status] - order[b.status] || (a.days_left ?? 1e9) - (b.days_left ?? 1e9));
  const by = tasks.reduce((m, t) => { m[t.status] = (m[t.status] || 0) + 1; return m; }, {});
  return { providers: providers.length, enrollments: enrollments.length, need_action: tasks.filter((t) => !['ok', 'pending', 'not_yet_effective'].includes(t.status)).length, by_status: by, tasks };
}
