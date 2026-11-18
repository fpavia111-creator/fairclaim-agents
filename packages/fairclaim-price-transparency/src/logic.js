// Fairclaim Price Transparency logic: the CMS hospital price transparency CSV (tall) check, the chargemaster
// comparison, and allowed-amount percentiles from remittances. No I/O.
//
// Basis: github.com/CMSgov/hospital-price-transparency, documentation/CSV/README.md and
// templates/V3.0.0_Tall_CSV_Format_Template.csv, read 2026-11-17. Template v3.0 data elements are
// effective 2026-01-01 with CMS enforcement from 2026-04-01 (CY2026 OPPS/ASC final rule).
import { str, num, isoDate, addDays, addMonths, daysBetween, npiValid, payerKey, round2 } from 'fairclaim-core';

export const CODE_TYPES = Object.freeze(['CPT', 'NDC', 'HCPCS', 'RC', 'ICD', 'DRG', 'MS-DRG', 'R-DRG', 'S-DRG', 'APS-DRG', 'AP-DRG', 'APR-DRG', 'APC', 'LOCAL', 'EAPG', 'HIPPS', 'CDT', 'CDM', 'TRIS-DRG', 'CMG', 'MS-LTC-DRG']);
export const METHODOLOGIES = Object.freeze(['case rate', 'fee schedule', 'percent of total billed charges', 'per diem', 'other']);
export const DRUG_TYPES = Object.freeze(['GR', 'ME', 'ML', 'UN', 'F2', 'EA', 'GM']);
export const SETTINGS = Object.freeze(['inpatient', 'outpatient', 'both']);
const ATTEST_START = 'to the best of its knowledge and belief';

const GENERAL = {
  3: ['hospital_name', 'last_updated_on', 'version', 'location_name', 'hospital_address', 'license_number', 'type_2_npi', 'attester_name'],
  2: ['hospital_name', 'last_updated_on', 'version', 'hospital_location', 'hospital_address', 'license_number'],
};
const COLUMNS = {
  3: ['description', 'modifiers', 'setting', 'drug_unit_of_measurement', 'drug_type_of_measurement', 'standard_charge|gross', 'standard_charge|discounted_cash', 'payer_name', 'plan_name', 'standard_charge|negotiated_dollar', 'standard_charge|negotiated_percentage', 'standard_charge|negotiated_algorithm', 'median_amount', '10th_percentile', '90th_percentile', 'count', 'standard_charge|methodology', 'standard_charge|min', 'standard_charge|max', 'additional_generic_notes'],
  2: ['description', 'modifiers', 'setting', 'drug_unit_of_measurement', 'drug_type_of_measurement', 'standard_charge|gross', 'standard_charge|discounted_cash', 'payer_name', 'plan_name', 'standard_charge|negotiated_dollar', 'standard_charge|negotiated_percentage', 'standard_charge|negotiated_algorithm', 'estimated_amount', 'standard_charge|methodology', 'standard_charge|min', 'standard_charge|max', 'additional_generic_notes'],
};
const NUMERIC = ['standard_charge|gross', 'standard_charge|discounted_cash', 'standard_charge|negotiated_dollar', 'standard_charge|negotiated_percentage', 'median_amount', '10th_percentile', '90th_percentile', 'estimated_amount', 'standard_charge|min', 'standard_charge|max', 'drug_unit_of_measurement'];

/** Header as CMS compares it: case-insensitive, spaces around pipes ignored. */
export const normHead = (h) => str(h).toLowerCase().replace(/\s*\|\s*/g, '|').replace(/\s+/g, ' ');
const isNum = (v) => /^-?\d+(\.\d+)?$/.test(str(v));
const countOk = (v) => /^(0|1 through 10|[1-9]\d*)$/i.test(str(v)) && !(/^\d+$/.test(str(v)) && Number(v) > 0 && Number(v) < 11);

/**
 * Check a tall CSV machine-readable file. rows: arrays of cells (parseCsvRows).
 * opts: { asOf, maxAgeDays (default 365), requiredCodes: [{ code, fact_id? }] }.
 * Returns { version, template, hospital, items, payers, issues, by_rule, errors, warnings, codes }.
 */
export function checkMrf(rows, { asOf = null, maxAgeDays = 365, requiredCodes = [] } = {}) {
  const issues = []; const items = []; const payers = new Map(); const seen = new Map(); const codes = new Map();
  let version = ''; let m = null; let hospital = null; let updated = null;
  const add = (severity, rule, row, column, message, extra = {}) => issues.push({ severity, rule, row, column, message, ...extra });
  if (rows.length < 3) { add('error', 'layout', 1, null, 'A tall CSV needs the general headers on row 1, their values on row 2 and the column headers on row 3.'); return finish(); }
  const h1 = rows[0].map(normHead); const v1 = rows[1].map(str);
  const gi = (name) => h1.findIndex((h) => h === name || h.startsWith(`${name}|`));
  version = gi('version') >= 0 ? v1[gi('version')] : '';
  const major = /^3\./.test(version) ? 3 : /^2\./.test(version) ? 2 : null;
  if (!major) add('error', 'version', 2, 'version', `Template version "${version || 'blank'}" is not 2.x or 3.x.`);
  else if (major === 2) add('warning', 'version', 2, 'version', `Version ${version}: CMS template v3.0 data elements apply from January 1, 2026 (enforced from April 1, 2026). Move to v3.0: add type_2_npi, attester_name, the new attestation, median, 10th and 90th percentile allowed amounts and count; drop estimated_amount.`);
  m = major || 3;
  for (const g of GENERAL[m]) {
    const i = gi(g);
    if (i < 0) { add('error', 'general_header', 1, g, `Row 1 has no ${g} header.`); continue; }
    if (g === 'license_number') {
      const st = h1[i].split('|')[1] || '';
      if (!/^[a-z]{2}$/.test(st)) add('error', 'placeholder', 1, h1[i], `Replace [state] in "license_number|[state]" with the two-letter state, e.g. license_number|AK.`);
      continue;
    }
    if (!v1[i] && g !== 'type_2_npi') add('error', 'general_value', 2, g, `Row 2 has no value for ${g}.`);
  }
  hospital = gi('hospital_name') >= 0 ? v1[gi('hospital_name')] : null;
  const lu = gi('last_updated_on') >= 0 ? v1[gi('last_updated_on')] : '';
  updated = /^\d{4}-\d{2}-\d{2}$/.test(lu) ? lu : /^\d{2}\/\d{2}\/\d{4}$/.test(lu) ? isoDate(lu) : null;
  if (lu && !updated) add('error', 'date_format', 2, 'last_updated_on', `last_updated_on "${lu}" is not YYYY-MM-DD.`);
  if (updated && asOf && daysBetween(updated, asOf) > maxAgeDays) add('error', 'stale', 2, 'last_updated_on', `Last updated ${updated}, ${daysBetween(updated, asOf)} days ago: the file must be updated at least once every 12 months.`);
  const ai = h1.findIndex((h) => h.startsWith(ATTEST_START));
  if (ai < 0) add('error', 'attestation', 1, null, m === 3 ? 'Row 1 has no attestation statement header (the CMS v3.0 text starting "To the best of its knowledge and belief, this hospital...").' : 'Row 1 has no affirmation statement header.');
  else {
    if (m === 3 && !h1[ai].includes('payer-specific negotiated charges that cannot be expressed as a dollar amount')) add('error', 'attestation', 1, 'attestation', 'The attestation header is not the v3.0 text: v3.0 adds the sentences about charges that cannot be expressed as a dollar amount. Copy it from the CMS template.');
    if (str(v1[ai]).toLowerCase() !== 'true') add('error', 'attestation', 2, 'attestation', `The attestation value is "${v1[ai] || 'blank'}": it must be true to meet 45 CFR 180.50(a)(3).`);
  }
  if (m === 3 && gi('type_2_npi') >= 0) {
    const npis = str(v1[gi('type_2_npi')]).split('|').map(str).filter(Boolean);
    if (!npis.length) add('warning', 'type_2_npi', 2, 'type_2_npi', 'No type 2 NPI: list the organizational NPI(s) for the hospital and its locations in the file, separated by |.');
    for (const n of npis) if (!npiValid(n)) add('error', 'type_2_npi', 2, 'type_2_npi', `NPI ${n} fails the check digit.`);
  }

  const h3 = rows[2].map(normHead);
  const col = (name) => h3.indexOf(name);
  for (const h of h3) if (/\[.*\]/.test(h)) add('error', 'placeholder', 3, h, `Header "${h}" still has a [placeholder]; replace it (code|[i] becomes code|1, code|2, ...).`);
  for (const c of COLUMNS[m]) if (col(c) < 0) add('error', 'column_header', 3, c, `Row 3 has no ${c} column.`);
  if (m === 3 && col('estimated_amount') >= 0) add('warning', 'removed_element', 3, 'estimated_amount', 'estimated_amount was removed in v3.0; use median_amount, 10th_percentile, 90th_percentile and count.');
  const pairs = [...new Set(h3.map((h) => (h.match(/^code\|(\d+)$/) || [])[1]).filter(Boolean))].map((i) => ({ i, code: col(`code|${i}`), type: col(`code|${i}|type`) }));
  if (!pairs.length) add('error', 'column_header', 3, 'code|1', 'Row 3 has no code|1 and code|1|type columns.');
  for (const p of pairs) if (p.type < 0) add('error', 'column_header', 3, `code|${p.i}|type`, `code|${p.i} has no matching code|${p.i}|type column.`);

  const get = (r, c) => (col(c) >= 0 ? str(r[col(c)]) : '');
  for (let n = 3; n < rows.length; n++) {
    const r = rows[n]; const row = n + 1;
    if (r.every((x) => !str(x))) continue;
    const v = (c) => get(r, c);
    const desc = v('description');
    const gross = v('standard_charge|gross'); const cash = v('standard_charge|discounted_cash');
    const dollar = v('standard_charge|negotiated_dollar'); const pct = v('standard_charge|negotiated_percentage'); const algo = v('standard_charge|negotiated_algorithm');
    const payer = v('payer_name'); const plan = v('plan_name'); const meth = v('standard_charge|methodology').toLowerCase();
    const notes = v('additional_generic_notes'); const count = v('count');
    const rowCodes = [];
    for (const p of pairs) {
      const c = str(r[p.code]); const t = p.type >= 0 ? str(r[p.type]).toUpperCase() : '';
      if (c && !t) add('error', 'rule_3', row, `code|${p.i}|type`, `Code ${c} has no code type.`);
      else if (t && !c) add('error', 'rule_3', row, `code|${p.i}`, `Code type ${t} has no code.`);
      else if (c && t) { if (!CODE_TYPES.includes(t)) add('error', 'code_type', row, `code|${p.i}|type`, `Code type "${t}" is not a CMS valid value.`); rowCodes.push({ code: c.toUpperCase(), type: t }); }
    }
    const anyCharge = [gross, cash, dollar, pct, algo].some(Boolean);
    if (!desc && anyCharge) add('error', 'description', row, 'description', 'A charge with no description.');
    if (desc && !anyCharge && !(v('modifiers') && notes)) add('error', 'rule_5', row, null, `"${desc.slice(0, 60)}" has no gross charge, cash price or negotiated charge.`);
    if (anyCharge && !rowCodes.length && !v('modifiers')) add('error', 'rule_2', row, 'code|1', `"${desc.slice(0, 60) || 'row'}" has a charge but no code and code type.`);
    const setting = v('setting').toLowerCase();
    if (setting && !SETTINGS.includes(setting)) add('error', 'setting', row, 'setting', `Setting "${v('setting')}" is not inpatient, outpatient or both.`);
    if (!setting && anyCharge) add('error', 'setting', row, 'setting', 'Setting is blank.');
    for (const c of NUMERIC) { const x = v(c); if (x && !isNum(x)) add('error', 'number_format', row, c, `${c} "${x}" must be a plain number (no $, % or thousands separator).`); }
    const negotiated = [dollar, pct, algo].some(Boolean);
    if (negotiated && (!payer || !plan)) add('error', 'rule_1', row, !payer ? 'payer_name' : 'plan_name', 'A negotiated charge needs a payer name and a plan name.');
    if (negotiated && !meth) add('error', 'rule_1', row, 'standard_charge|methodology', 'A negotiated charge needs a methodology.');
    if ((payer || plan) && !negotiated) add('error', 'rule_1', row, 'standard_charge|negotiated_dollar', `${payer || plan} is named but no negotiated dollar amount, percentage or algorithm is given.`);
    if (meth && !METHODOLOGIES.includes(meth)) add('error', 'methodology', row, 'standard_charge|methodology', `Methodology "${v('standard_charge|methodology')}" is not one of: ${METHODOLOGIES.join(', ')}.`);
    if (meth === 'other' && !notes) add('error', 'rule_4', row, 'additional_generic_notes', 'Methodology "other" needs an explanation in additional_generic_notes.');
    if (dollar && (!v('standard_charge|min') || !v('standard_charge|max'))) add('error', 'rule_6', row, 'standard_charge|min', 'A negotiated dollar amount needs the de-identified minimum and maximum.');
    if (dollar && isNum(dollar) && isNum(v('standard_charge|min')) && isNum(v('standard_charge|max')) && (Number(dollar) < Number(v('standard_charge|min')) || Number(dollar) > Number(v('standard_charge|max')))) add('warning', 'min_max', row, 'standard_charge|negotiated_dollar', `Negotiated ${dollar} is outside the minimum ${v('standard_charge|min')} and maximum ${v('standard_charge|max')} for this item.`);
    if (m === 3 && (pct || algo)) {
      if (!count) add('error', 'rule_7', row, 'count', 'A percentage or algorithm needs the count of allowed amounts.');
      else if (!countOk(count)) add('error', 'count_format', row, 'count', `Count "${count}" must be 0, "1 through 10", or a whole number of 11 or more with no thousands separator.`);
      if (count && count !== '0' && ['median_amount', '10th_percentile', '90th_percentile'].some((c) => !v(c))) add('error', 'rule_8', row, 'median_amount', 'A percentage or algorithm needs the median, 10th and 90th percentile allowed amounts (unless the count is 0).');
      if (count === '0' && !notes) add('error', 'rule_9', row, 'additional_generic_notes', 'A count of 0 needs a note explaining why there were no remittances.');
    } else if (m === 3 && count && !countOk(count)) add('error', 'count_format', row, 'count', `Count "${count}" must be 0, "1 through 10", or a whole number of 11 or more.`);
    const [p10, med, p90] = ['10th_percentile', 'median_amount', '90th_percentile'].map((c) => (isNum(v(c)) ? Number(v(c)) : null));
    if (p10 !== null && med !== null && p90 !== null && !(p10 <= med && med <= p90)) add('error', 'percentiles', row, 'median_amount', `Percentiles out of order: 10th ${p10}, median ${med}, 90th ${p90}.`);
    if (rowCodes.some((c) => c.type === 'NDC') && (!v('drug_unit_of_measurement') || !v('drug_type_of_measurement'))) add('error', 'rule_10', row, 'drug_unit_of_measurement', 'An NDC needs the drug unit and drug type of measurement.');
    if (!!v('drug_unit_of_measurement') !== !!v('drug_type_of_measurement')) add('error', 'rule_12', row, 'drug_type_of_measurement', 'Drug unit and drug type of measurement go together.');
    if (v('drug_type_of_measurement') && !DRUG_TYPES.includes(v('drug_type_of_measurement').toUpperCase())) add('error', 'drug_type', row, 'drug_type_of_measurement', `Drug type "${v('drug_type_of_measurement')}" is not one of ${DRUG_TYPES.join(', ')}.`);
    if (isNum(gross) && isNum(cash) && Number(cash) > Number(gross)) add('warning', 'cash_over_gross', row, 'standard_charge|discounted_cash', `Cash price ${cash} is above the gross charge ${gross}.`);
    const key = [desc.toLowerCase(), rowCodes.map((c) => `${c.type}:${c.code}`).join(','), v('modifiers'), setting, payerKey(payer), payerKey(plan)].join('|');
    if (seen.has(key)) add('warning', 'duplicate', row, null, `Same item, setting, payer and plan as row ${seen.get(key)}.`); else seen.set(key, row);
    if (payer) payers.set(`${payer}|${plan}`, { payer_name: payer, plan_name: plan, rows: ((payers.get(`${payer}|${plan}`) || {}).rows || 0) + 1 });
    for (const c of rowCodes) { const e = codes.get(c.code) || { code: c.code, type: c.type, description: desc, gross: null, rows: 0 }; e.rows++; if (isNum(gross) && e.gross === null) e.gross = Number(gross); codes.set(c.code, e); }
    items.push(row);
  }
  for (const rc of requiredCodes) if (!codes.has(String(rc.code).toUpperCase())) add('error', 'required_code', null, null, `${rc.code} is on your required list${rc.note ? ` (${rc.note})` : ''} but is not in the file.`, rc.fact_id ? { fact_id: rc.fact_id } : {});
  return finish();

  function finish() {
    const order = { error: 0, warning: 1 };
    issues.sort((a, b) => order[a.severity] - order[b.severity] || (a.row ?? 0) - (b.row ?? 0));
    const by = issues.reduce((x, i) => { x[i.rule] = (x[i.rule] || 0) + 1; return x; }, {});
    return { version: version || null, template: m ? `v${m}` : null, hospital, last_updated_on: updated, data_rows: items.length, payer_plans: [...payers.values()], codes, errors: issues.filter((i) => i.severity === 'error').length, warnings: issues.filter((i) => i.severity === 'warning').length, by_rule: by, issues };
  }
}

/** Compare the file's codes with the chargemaster: every item must be in the file, at the same gross charge. */
export function compareChargemaster(codes, cdm, { tolerance = 0.01 } = {}) {
  const out = [];
  for (const r of cdm) {
    const code = str(r.code).toUpperCase(); if (!code) continue;
    const price = num(r.price);
    const e = codes.get(code);
    if (!e) out.push({ code, description: str(r.description) || null, chargemaster: price, file: null, status: 'missing_from_file', message: `${code} is in the chargemaster but not in the file: the file must list every item and service.` });
    else if (price !== null && e.gross !== null && Math.abs(price - e.gross) > tolerance) out.push({ code, description: str(r.description) || e.description, chargemaster: price, file: e.gross, status: 'gross_differs', message: `Gross charge in the file ${e.gross} differs from the chargemaster ${price}.` });
  }
  const inCdm = new Set(cdm.map((r) => str(r.code).toUpperCase()));
  for (const e of codes.values()) if (['CPT', 'HCPCS'].includes(e.type) && !inCdm.has(e.code)) out.push({ code: e.code, description: e.description, chargemaster: null, file: e.gross, status: 'not_in_chargemaster', message: `${e.code} is in the file but not in the chargemaster: check it is still offered.` });
  return out;
}

/**
 * The CMS percentile rule: sort ascending; when the percentile falls between two observed
 * amounts, take the next highest observed amount.
 */
export function cmsPercentile(sorted, p) {
  if (!sorted.length) return null;
  const h = p * (sorted.length - 1);
  return sorted[Math.ceil(h - 1e-9)];
}
export const countLabel = (n) => (n === 0 ? '0' : n <= 10 ? '1 through 10' : String(n));

/**
 * Allowed amounts per payer, plan and code from remittance claims (835 or ERA export).
 * Total allowed per line = the 835 allowed amount (AMT*B6) when sent, else charge minus CO/PI/OA
 * adjustments. Reversals (status 22) and $0 allowed lines are left out, as CMS asks.
 * opts: { from, to, postingDate, plans: [{ payer, plan_name }] }.
 */
export function allowedAmounts(claims, { from, to, postingDate = null, plans = [] } = {}) {
  const notes = [];
  if (from && to && (addMonths(from, 12) > addDays(to, 1) || addDays(to, 1) > addMonths(from, 15))) notes.push(`The period ${from} to ${to} is not between 12 and 15 months long; CMS asks for allowed amounts from no less than 12 and no more than 15 months before posting.`);
  if (postingDate && to && to > postingDate) notes.push(`The period ends ${to}, after the posting date ${postingDate}.`);
  const groups = new Map(); const skipped = { reversal: 0, zero: 0, outside: 0 };
  for (const c of claims) {
    if (str(c.status) === '22' || (c.paid ?? 0) < 0) { skipped.reversal++; continue; }
    for (const l of c.lines || []) {
      const d = l.date_from || c.service_from || c.payment_date;
      if ((from && d && d < from) || (to && d && d > to)) { skipped.outside++; continue; }
      const adj = (l.adjustments || []).filter((a) => ['CO', 'PI', 'OA'].includes(a.group)).reduce((s, a) => s + (a.amount || 0), 0);
      const allowed = l.allowed !== null && l.allowed !== undefined ? l.allowed : round2((l.charge || 0) - adj);
      if (!(allowed > 0)) { skipped.zero++; continue; }
      const plan = (plans.find((p) => payerKey(p.payer) === payerKey(c.payer)) || {}).plan_name || null;
      const k = `${payerKey(c.payer)}|${l.code}|${(l.modifiers || []).join(':')}`;
      const g = groups.get(k) || { payer_name: c.payer, plan_name: plan, code: l.code, modifiers: (l.modifiers || []).join(' '), amounts: [] };
      g.amounts.push(allowed); groups.set(k, g);
    }
  }
  const rows = [...groups.values()].map((g) => {
    const s = g.amounts.sort((a, b) => a - b);
    return { payer_name: g.payer_name, plan_name: g.plan_name, code: g.code, code_type: /^\d{4}[0-9FTU]$/.test(g.code) ? 'CPT' : /^[A-V]\d{4}$/.test(g.code) ? 'HCPCS' : 'LOCAL', modifiers: g.modifiers, n: s.length, count: countLabel(s.length), '10th_percentile': cmsPercentile(s, 0.1), median_amount: cmsPercentile(s, 0.5), '90th_percentile': cmsPercentile(s, 0.9), plan_missing: !g.plan_name };
  }).sort((a, b) => a.payer_name.localeCompare(b.payer_name) || a.code.localeCompare(b.code));
  if (rows.some((r) => r.plan_missing)) notes.push(`No plan name for: ${[...new Set(rows.filter((r) => r.plan_missing).map((r) => r.payer_name))].join(', ')}. The file needs payer and plan; add them under plans in the config.`);
  return { from: from || null, to: to || null, lines_used: rows.reduce((s, r) => s + r.n, 0), skipped, notes, rows };
}

/** Default period: the 12 months up to the day before the posting date. */
export function defaultPeriod(postingDate) {
  return { from: addMonths(postingDate, -12), to: addDays(postingDate, -1) };
}
