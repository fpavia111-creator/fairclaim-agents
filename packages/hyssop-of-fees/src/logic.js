// Hyssop logic: Medicare Physician Fee Schedule pricing (RVU x GPCI x CF) and a fee schedule review. No I/O.
import { str, num, round2, pct } from 'remedy-core';

const PRICED = new Set(['A', 'R', 'T']); // status codes that carry a payment amount
export const STATUS_TEXT = Object.freeze({ A: 'Active', B: 'Bundled (not paid separately)', C: 'Carrier priced', D: 'Deleted', E: 'Excluded by regulation', I: 'Not valid for Medicare', M: 'Measurement code', N: 'Non-covered', P: 'Bundled or excluded', R: 'Restricted coverage', T: 'Paid only when no other service that day', X: 'Statutory exclusion', J: 'Anesthesia service (priced under the anesthesia conversion factor, not RVUs)', F: 'Deleted, carrier priced', G: 'Not valid for Medicare; another code is used', H: 'Deleted modifier', Q: 'Therapy functional information code' });

/** RVU index: code|modifier → row. Rows from the PPRRVU or pfs.data.cms.gov indicators file. */
export function rvuIndex(rows) {
  const m = new Map();
  for (const r of rows) {
    const code = str(r.code).toUpperCase(); if (!code) continue;
    const k = `${code}|${str(r.modifier).toUpperCase()}`;
    if (!m.has(k)) m.set(k, { code, modifier: str(r.modifier).toUpperCase(), status: str(r.status).toUpperCase() || 'A', work: num(r.work_rvu) ?? 0, pe_nonfac: num(r.pe_nonfac) ?? 0, pe_fac: num(r.pe_fac) ?? 0, mp: num(r.mp_rvu) ?? 0, conv_factor: num(r.conv_factor), description: str(r.description) || null });
  }
  return m;
}

/** Medicare amount for one RVU row. setting: 'nonfacility' (office) or 'facility'. */
export function priceRvu(rvu, gpci, cf, setting = 'nonfacility') {
  const pe = setting === 'facility' ? rvu.pe_fac : rvu.pe_nonfac;
  return round2((rvu.work * gpci.work + pe * gpci.pe + rvu.mp * gpci.mp) * cf);
}

/** Pick the locality row: by name (case-insensitive, partial) or the only row. */
export function pickLocality(rows, locality) {
  const list = rows.map((r) => ({ locality: str(r.locality), work: num(r.work_gpci), pe: num(r.pe_gpci), mp: num(r.mp_gpci) })).filter((r) => r.work !== null && r.pe !== null && r.mp !== null);
  if (!list.length) throw new Error('the GPCI file has no rows with work, PE and malpractice GPCIs');
  if (!locality) { if (list.length === 1) return list[0]; throw new Error(`the GPCI file has ${list.length} localities; pass locality (for example "${list[0].locality}")`); }
  const q = locality.toLowerCase();
  const hit = list.find((r) => r.locality.toLowerCase() === q) || list.filter((r) => r.locality.toLowerCase().includes(q));
  if (Array.isArray(hit)) { if (hit.length === 1) return hit[0]; throw new Error(hit.length ? `locality "${locality}" matches ${hit.length} rows: ${hit.slice(0, 5).map((r) => r.locality).join('; ')}` : `locality "${locality}" is not in the GPCI file`); }
  return hit;
}

/**
 * fees: FEE_FIELDS rows { code, modifier, description, fee, volume }. config: { conv_factor, target_percent, ceiling_percent, setting, locality }.
 * facts: accepted fee_target facts. Returns { codes, rows, by_status, totals }.
 */
export function reviewFees(fees, rvuRows, gpciRows, { config = {}, facts = [] } = {}) {
  const idx = rvuIndex(rvuRows);
  const gpci = pickLocality(gpciRows, config.locality);
  const fileCf = [...idx.values()].map((r) => r.conv_factor).find((x) => x > 0);
  const cf = num(config.conv_factor) || fileCf;
  if (!cf) throw new Error('no conversion factor: the RVU file has none, so set conv_factor in the fee config (the CMS figure for the year you price)');
  const setting = config.setting || 'nonfacility';
  const baseTarget = Number.isFinite(config.target_percent) ? config.target_percent : null;
  const ceiling = Number.isFinite(config.ceiling_percent) ? config.ceiling_percent : null;
  const rows = [];
  for (const f of fees) {
    const code = str(f.code).toUpperCase(); if (!code) continue;
    const mod = str(f.modifier).toUpperCase();
    const fee = num(f.fee); const volume = num(f.volume);
    // A professional (26) or technical (TC) fee is never priced from the global row: that would price the whole service.
    const rvu = idx.get(`${code}|${mod}`) || (['26', 'TC'].includes(mod) ? null : idx.get(`${code}|`));
    const memo = facts.filter((x) => (x.value.codes || []).some((p) => (p.endsWith('*') ? code.startsWith(p.slice(0, -1).toUpperCase()) : code === p.toUpperCase())));
    const target = Math.max(baseTarget ?? 0, ...memo.map((x) => x.value.percent)) || null;
    const fact = memo.sort((a, b) => b.value.percent - a.value.percent)[0];
    const row = { code, modifier: mod || null, description: str(f.description) || (rvu && rvu.description) || null, fee, volume, medicare: null, percent_of_medicare: null, target_percent: target, target_fee: null, status: 'ok', message: '', gap_per_unit: 0, gap_total: 0, ...(fact && target === fact.value.percent && target !== baseTarget ? { fact_id: fact.id } : {}) };
    if (!rvu) Object.assign(row, { status: 'no_rvu', message: 'Not in the RVU file: price it another way (a payer schedule, a lab or drug file, or by hand).' });
    else if (!PRICED.has(rvu.status)) Object.assign(row, { status: 'no_medicare_price', message: `Medicare status ${rvu.status}: ${STATUS_TEXT[rvu.status] || 'not priced'}. Price it from your payer contracts.` });
    else {
      row.medicare = priceRvu(rvu, gpci, cf, setting);
      if (fee === null) Object.assign(row, { status: 'no_fee', message: `No fee set; Medicare pays ${row.medicare} here.` });
      else {
        row.percent_of_medicare = pct(fee, row.medicare);
        row.target_fee = target ? round2(row.medicare * target / 100) : null;
        if (fee < row.medicare) Object.assign(row, { status: 'below_medicare', message: `Fee ${fee} is below the Medicare amount ${row.medicare}. Payers pay the lower of the fee and the allowed amount, so this caps every payer at ${fee}.`, gap_per_unit: round2(row.medicare - fee) });
        else if (target && fee < row.target_fee) Object.assign(row, { status: 'below_target', message: `Fee is ${row.percent_of_medicare}% of Medicare; your target is ${target}% (${row.target_fee}).`, gap_per_unit: round2(row.target_fee - fee) });
        else if (ceiling && row.percent_of_medicare > ceiling) Object.assign(row, { status: 'above_ceiling', message: `Fee is ${row.percent_of_medicare}% of Medicare, above your ceiling of ${ceiling}%: self-pay patients and good-faith estimates see this price.` });
      }
      if (row.gap_per_unit && volume) row.gap_total = round2(row.gap_per_unit * volume);
    }
    rows.push(row);
  }
  const order = { below_medicare: 0, below_target: 1, no_fee: 2, above_ceiling: 3, no_medicare_price: 4, no_rvu: 5, ok: 6 };
  rows.sort((a, b) => order[a.status] - order[b.status] || b.gap_total - a.gap_total || b.gap_per_unit - a.gap_per_unit);
  const by = rows.reduce((m, r) => { m[r.status] = (m[r.status] || 0) + 1; return m; }, {});
  return { codes: rows.length, locality: gpci.locality, gpci: { work: gpci.work, pe: gpci.pe, mp: gpci.mp }, conv_factor: cf, conv_factor_source: num(config.conv_factor) ? 'config' : 'rvu_file', setting, by_status: by, below_medicare_gap: round2(rows.filter((r) => r.status === 'below_medicare').reduce((s, r) => s + r.gap_total, 0)), below_target_gap: round2(rows.filter((r) => r.status === 'below_target').reduce((s, r) => s + r.gap_total, 0)), rows };
}
