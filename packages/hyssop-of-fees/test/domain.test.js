// Domain checks for fee schedule pricing against the Medicare Physician Fee Schedule (ver 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewFees, rvuIndex, priceRvu } from '../src/logic.js';

const gpci = [{ locality: 'Example Locality', work_gpci: 1.02, pe_gpci: 0.95, mp_gpci: 0.8 }];
const rvu = [
  { code: '71046', modifier: '', status: 'A', work_rvu: 0.22, pe_nonfac: 0.8, pe_fac: 0.8, mp_rvu: 0.02 },
  { code: '71046', modifier: '26', status: 'A', work_rvu: 0.22, pe_nonfac: 0.09, pe_fac: 0.09, mp_rvu: 0.01 },
  { code: '99213', modifier: '', status: 'A', work_rvu: 1.3, pe_nonfac: 1.2, pe_fac: 0.5, mp_rvu: 0.1, conv_factor: 32 },
  { code: '00790', modifier: '', status: 'J', work_rvu: 0, pe_nonfac: 0, pe_fac: 0, mp_rvu: 0 },
  { code: '93000', modifier: '', status: 'B', work_rvu: 0.17, pe_nonfac: 0.3, pe_fac: 0.3, mp_rvu: 0.01 },
];
const run = (fees, config = {}) => reviewFees(fees, rvu, gpci, { config });
const row = (r, code, mod = null) => r.rows.find((x) => x.code === code && x.modifier === mod);

test('the amount is (work x GPCI + PE x GPCI + MP x GPCI) x CF, using the setting asked for', () => {
  const g = { work: 1.02, pe: 0.95, mp: 0.8 };
  const r = rvuIndex(rvu).get('99213|');
  assert.equal(priceRvu(r, g, 32), Math.round((1.3 * 1.02 + 1.2 * 0.95 + 0.1 * 0.8) * 32 * 100) / 100);
  assert.equal(priceRvu(r, g, 32, 'facility'), Math.round((1.3 * 1.02 + 0.5 * 0.95 + 0.1 * 0.8) * 32 * 100) / 100);
  assert.equal(run([{ code: '99213', fee: 200 }], { setting: 'facility' }).rows[0].medicare, priceRvu(r, g, 32, 'facility'));
});

test('the conversion factor comes from the config first, then the RVU file', () => {
  assert.deepEqual([run([{ code: '99213', fee: 200 }]).conv_factor_source, run([{ code: '99213', fee: 200 }]).conv_factor], ['rvu_file', 32]);
  assert.deepEqual([run([{ code: '99213', fee: 200 }], { conv_factor: 33.5 }).conv_factor_source, run([{ code: '99213', fee: 200 }], { conv_factor: 33.5 }).conv_factor], ['config', 33.5]);
  assert.throws(() => reviewFees([{ code: 'X', fee: 1 }], [{ code: 'X', status: 'A', work_rvu: 1 }], gpci), /no conversion factor/);
});

test('a professional component fee is priced from the 26 row, never from the global row', () => {
  const r = run([{ code: '71046', modifier: '26', fee: 15 }, { code: '71046', modifier: 'TC', fee: 20 }]);
  assert.equal(row(r, '71046', '26').medicare, priceRvu(rvuIndex(rvu).get('71046|26'), { work: 1.02, pe: 0.95, mp: 0.8 }, 32));
  assert.equal(row(r, '71046', 'TC').status, 'no_rvu', 'no TC row in the file: not priced as the whole service');
});

test('a fee below Medicare caps every payer; the gap is multiplied by the volume', () => {
  const r = run([{ code: '99213', fee: 80, volume: 100 }]);
  const x = r.rows[0];
  assert.equal(x.status, 'below_medicare');
  assert.match(x.message, /caps every payer at 80/);
  assert.equal(x.gap_total, Math.round((x.medicare - 80) * 100 * 100) / 100);
  assert.equal(r.below_medicare_gap, x.gap_total);
});

test('target and ceiling: below the target, above the ceiling, or fine', () => {
  const cfg = { target_percent: 150, ceiling_percent: 300 };
  const m = run([{ code: '99213', fee: 1 }]).rows[0].medicare;
  const r = run([{ code: '99213', fee: Math.ceil(m * 1.2) }, { code: '99213', modifier: '25', fee: Math.ceil(m * 3.5) }, { code: '99213', modifier: '95', fee: Math.ceil(m * 2) }], cfg);
  assert.deepEqual(r.rows.map((x) => [x.modifier, x.status]), [[null, 'below_target'], ['25', 'above_ceiling'], ['95', 'ok']]);
});

test('anesthesia and bundled codes are not priced from RVUs, and an empty fee shows the Medicare amount', () => {
  const r = run([{ code: '00790', fee: 900 }, { code: '93000', fee: 40 }, { code: '99213', fee: '' }]);
  assert.match(row(r, '00790').message, /status J: Anesthesia service/);
  assert.match(row(r, '93000').message, /status B: Bundled/);
  assert.equal(row(r, '99213').status, 'no_fee');
});
