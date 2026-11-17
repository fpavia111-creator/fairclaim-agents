// Lovage logic: telehealth line checks against each payer's rules. No I/O.
import { str, isoDate, modifierList, payerKey } from 'remedy-core';

// CPT telemedicine E/M codes (2025): 98000-98007 synchronous audio-video, 98008-98015 audio-only,
// 98016 brief virtual check-in. 99441-99443 (telephone E/M) were deleted for 2025.
export const VIDEO_CODES = Object.freeze(['98000', '98001', '98002', '98003', '98004', '98005', '98006', '98007']);
export const AUDIO_CODES = Object.freeze(['98008', '98009', '98010', '98011', '98012', '98013', '98014', '98015']);
export const DELETED = Object.freeze({ 99441: 'telephone E/M, 5-10 minutes', 99442: 'telephone E/M, 11-20 minutes', 99443: 'telephone E/M, 21-30 minutes' });
export const CONSENT_CODES = Object.freeze(['98016', 'G2012', 'G2252', '99421', '99422', '99423', 'G2010', '98970', '98971', '98972']);
const TELE_MODS = ['95', 'GT', 'GQ', '93', 'FQ', 'FR'];
/** Example rule used when the config has none for a payer. Not any payer's policy. */
export const DEFAULT_RULE = Object.freeze({ pos: ['02', '10'], modifier: null, audio_modifier: '93', audio_allowed: true, telemedicine_codes: false });

const yes = (v) => /^(y|yes|true|1|on file|signed|verbal|written|documented)$/i.test(str(v));
const isHome = (v) => /home|residence|house/i.test(str(v));
const isAudio = (v) => /audio|phone|telephone|voice/i.test(str(v)) && !/video/i.test(str(v));

/**
 * rows: TELE_FIELDS rows, one per line. config: { payers: [{ name, ...rule }], default_rule, providers: [{ name, states }] }.
 * facts: payer_telehealth_rule (adds requirements for a payer).
 */
export function checkTelehealth(rows, { config = {}, facts = [] } = {}) {
  const ruleFor = (payer) => {
    const base = { ...DEFAULT_RULE, ...(config.default_rule || {}), ...((config.payers || []).find((p) => payerKey(p.name) === payerKey(payer)) || {}), source: (config.payers || []).some((p) => payerKey(p.name) === payerKey(payer)) ? 'config' : 'default' };
    const learned = facts.filter((f) => payerKey(f.value.payer) === payerKey(payer));
    for (const f of learned) { if (f.value.modifier) base.modifier = f.value.modifier; if (f.value.audio_modifier) base.audio_modifier = f.value.audio_modifier; if (f.value.audio_allowed === false) base.audio_allowed = false; if (f.value.pos) base.pos = base.pos.filter((p) => f.value.pos.includes(p)).length ? base.pos.filter((p) => f.value.pos.includes(p)) : f.value.pos; base.fact_id = f.id; }
    return base;
  };
  const lic = new Map((config.providers || []).map((p) => [str(p.name).toLowerCase(), p.states.map((s) => s.toUpperCase())]));
  const lines = rows.map((r, i) => ({ i, claim_id: str(r.claim_id), patient_name: str(r.patient_name) || null, who: str(r.member_id).toUpperCase() || str(r.patient_name).toLowerCase(), payer: str(r.payer) || null, provider: str(r.provider) || null, date: isoDate(r.date_of_service), code: str(r.code).toUpperCase(), mods: modifierList(r.modifiers), pos: str(r.pos).padStart(2, '0').slice(-2), state: str(r.patient_state).toUpperCase() || null, location: str(r.patient_location) || null, modality: str(r.modality) || null, consent: r.consent }));
  const sameDay = new Map(); for (const y of lines) { const k = `${y.who}|${y.date}|${y.provider}`; if (!sameDay.has(k)) sameDay.set(k, []); sameDay.get(k).push(y); }
  const out = [];
  for (const x of lines) {
    const tele = ['02', '10'].includes(x.pos) || x.mods.some((m) => TELE_MODS.includes(m)) || VIDEO_CODES.includes(x.code) || AUDIO_CODES.includes(x.code) || CONSENT_CODES.includes(x.code) || !!x.modality || !!DELETED[x.code] || x.code === 'Q3014';
    if (!tele) continue;
    const issues = []; const add = (check, severity, message) => issues.push({ check, severity, message });
    const rule = ruleFor(x.payer);
    const audio = !CONSENT_CODES.includes(x.code) && (isAudio(x.modality) || AUDIO_CODES.includes(x.code) || x.mods.includes('93') || x.mods.includes('FQ'));
    if (DELETED[x.code]) add('deleted_code', 'error', `${x.code} (${DELETED[x.code]}) was deleted for 2025: use the payer's audio-only code (98008-98015, or an office visit code with ${rule.audio_modifier || '93'}).`);
    if (VIDEO_CODES.includes(x.code) && isAudio(x.modality)) add('modality', 'error', `${x.code} is an audio-video code but the visit was audio-only: use 98008-98015 or the payer's audio-only rule.`);
    if (AUDIO_CODES.includes(x.code) && /video/i.test(str(x.modality))) add('modality', 'error', `${x.code} is an audio-only code but the visit had video: use 98000-98007 or the payer's video rule.`);
    if ((VIDEO_CODES.includes(x.code) || AUDIO_CODES.includes(x.code)) && !rule.telemedicine_codes) add('payer_code', 'error', `${x.payer || 'This payer'} does not take the 98000-98015 telemedicine codes in your rules: bill the office visit code (99202-99215) with its telehealth place of service and modifiers.`);
    if (audio && !rule.audio_allowed) add('audio_only', 'error', `${x.payer || 'This payer'} does not cover audio-only visits in your rules.`);
    const site = x.code === 'Q3014'; // originating site fee: billed with the facility's own place of service, no telehealth modifier
    if (site) { /* place of service and modifier rules are for the distant-site service */ } else if (!x.pos || x.pos === '00') add('pos', 'error', 'No place of service.');
    else if (!rule.pos.includes(x.pos)) add('pos', 'error', `Place of service ${x.pos}: ${x.payer || 'this payer'} wants ${rule.pos.join(' or ')} for telehealth in your rules.`);
    if (!site && x.pos === '02' && isHome(x.location) && rule.pos.includes('10')) add('pos', 'error', 'The patient was at home: place of service 10 (telehealth in the patient\'s home), not 02.');
    if (!site && x.pos === '10' && x.location && !isHome(x.location)) add('pos', 'error', `The patient was at ${x.location}, not home: place of service 02.`);
    if (!site && rule.modifier && !x.mods.includes(rule.modifier) && !(audio && rule.audio_modifier && x.mods.includes(rule.audio_modifier))) add('modifier', 'error', `${x.payer || 'This payer'} wants modifier ${rule.modifier} on telehealth lines.`);
    if (!site && audio && rule.audio_allowed && rule.audio_modifier && !x.mods.includes(rule.audio_modifier) && !AUDIO_CODES.includes(x.code)) add('modifier', 'error', `Audio-only visit: add ${rule.audio_modifier}.`);
    if (x.mods.includes('GT') && rule.modifier && rule.modifier !== 'GT') add('modifier', 'warning', `GT is an older telehealth modifier; ${x.payer || 'this payer'} wants ${rule.modifier}.`);
    if (CONSENT_CODES.includes(x.code) && !yes(x.consent)) add('consent', 'warning', `${x.code} needs the patient's consent documented (check what form your payer accepts); none is recorded.`);
    if (x.code === 'Q3014' && isHome(x.location)) add('originating_site', 'error', 'Q3014 (originating site fee) is billed by the facility where the patient is, not for a patient at home.');
    const states = x.provider ? lic.get(x.provider.toLowerCase()) : null;
    if (states && x.state && !states.includes(x.state)) add('license', 'error', `${x.provider} is not licensed in ${x.state} in your list (${states.join(', ')}): telehealth follows the patient's location.`);
    if (!x.state && lic.size) add('license', 'warning', 'No patient state recorded: telehealth licensing follows where the patient is.');
    const inPerson = (sameDay.get(`${x.who}|${x.date}|${x.provider}`) || []).filter((y) => y !== x && !['02', '10'].includes(y.pos) && /^99(20[2-5]|21[1-5])$/.test(y.code));
    if (inPerson.length && /^99(20[2-5]|21[1-5])$|^980(0\d|1[0-5])$/.test(x.code)) add('same_day', 'warning', `The same provider also billed an in-person visit (${inPerson.map((y) => y.claim_id).join(', ')}) on ${x.date}: check whether this payer pays both, or bill one visit.`);
    const sev = issues.some((i) => i.severity === 'error') ? 'error' : issues.length ? 'warning' : 'ok';
    out.push({ claim_id: x.claim_id, patient_name: x.patient_name, payer: x.payer, provider: x.provider, date_of_service: x.date, code: x.code, modifiers: x.mods.join(' '), pos: x.pos, patient_location: x.location, patient_state: x.state, modality: x.modality, rule: `${rule.source === 'config' ? 'your rule' : 'example rule'}: POS ${rule.pos.join('/')}${rule.modifier ? `, modifier ${rule.modifier}` : ''}${!rule.audio_allowed ? ', no audio-only' : rule.audio_modifier ? `, audio-only ${rule.audio_modifier}` : ''}${rule.telemedicine_codes ? ', takes 98000-98015' : ''}`, status: sev, issues, ...(rule.fact_id ? { fact_id: rule.fact_id } : {}) });
  }
  const order = { error: 0, warning: 1, ok: 2 };
  out.sort((a, b) => order[a.status] - order[b.status] || a.claim_id.localeCompare(b.claim_id));
  const by = {}; for (const r of out) for (const i of r.issues) by[i.check] = (by[i.check] || 0) + 1;
  return { lines_checked: rows.length, telehealth_lines: out.length, errors: out.filter((r) => r.status === 'error').length, warnings: out.filter((r) => r.status === 'warning').length, by_check: by, items: out };
}
