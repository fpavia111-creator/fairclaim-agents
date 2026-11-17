// Domain checks for NCCI PTP and MUE edits (ver 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkEdits, ptpIndex, mueIndex, bypassUsed, lookupPair } from '../src/logic.js';

const claim = (id, lines, o = {}) => ({ claim_id: id, member_id: o.member || 'M1', patient_name: 'Pat Example', payer_name: o.payer || 'Example Health Plan', billing_npi: o.npi || '1234567893', lines: lines.map((l, i) => ({ line: i + 1, modifiers: [], units: 1, charge: 50, date_from: '2026-01-05', ...l })) });
const ptp = ptpIndex([
  { column_1: '29881', column_2: '29877', modifier_indicator: '0', effective: '20100101' },
  { column_1: '99213', column_2: '96372', modifier_indicator: '1', effective: '20100101' },
  { column_1: '20610', column_2: '20604', modifier_indicator: '1', effective: '20100101' },
  { column_1: '11042', column_2: '97597', modifier_indicator: '9', effective: '20100101' },
]);

test('indicator 0 cannot be bypassed even with 59; indicator 9 means the edit no longer applies', () => {
  const r = checkEdits([claim('A', [{ code: '29881' }, { code: '29877', modifiers: ['59'] }]), claim('B', [{ code: '11042' }, { code: '97597' }])], { ptp });
  assert.deepEqual(r.findings.map((f) => [f.claim_id, f.kind]), [['A', 'ptp_no_modifier']]);
  assert.equal(r.at_risk_amount, 50);
});

test('25 bypasses an edit only on the E/M line; 25 on the injection does not', () => {
  const ok = checkEdits([claim('A', [{ code: '99213', modifiers: ['25'] }, { code: '96372' }])], { ptp });
  const bad = checkEdits([claim('B', [{ code: '99213' }, { code: '96372', modifiers: ['25'] }])], { ptp });
  assert.deepEqual(ok.findings.map((f) => f.kind), ['ptp_bypassed']);
  assert.deepEqual(bad.findings.map((f) => f.kind), ['ptp_needs_modifier']);
  assert.deepEqual(bypassUsed(['25'], [], '20610', '20604'), []);
  assert.deepEqual(bypassUsed(['XS'], [], '20610', '20604'), ['XS']);
});

test('the same pair is reported once per column 2 line, even when the column 1 code is on two lines', () => {
  const r = checkEdits([claim('A', [{ code: '20610', modifiers: ['RT'] }, { code: '20610', modifiers: ['RT'] }, { code: '20604', modifiers: ['RT'] }])], { ptp });
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].line, 3);
});

test('codes on different dates of one claim are not paired', () => {
  const r = checkEdits([claim('A', [{ code: '29881', date_from: '2026-01-05' }, { code: '29877', date_from: '2026-01-06' }])], { ptp });
  assert.equal(r.findings_total, 0);
});

test('a day MUE adds units across claims of the same provider, not across providers', () => {
  const mue = mueIndex([{ code: '20610', mue: '2', mai: '2 Date of Service Edit: Policy' }, { code: '97110', mue: 4, mai: '3 Date of Service Edit: Clinical' }]);
  const same = checkEdits([claim('A', [{ code: '20610', units: 2 }]), claim('B', [{ code: '20610', units: 1 }])], { mue });
  const other = checkEdits([claim('A', [{ code: '20610', units: 2 }]), claim('B', [{ code: '20610', units: 1 }], { npi: '1098765435' })], { mue });
  assert.deepEqual([same.findings[0].kind, same.findings[0].severity, same.findings[0].claim_id, same.findings[0].units], ['mue_day', 'error', 'A, B', 3]);
  assert.equal(other.findings_total, 0);
  const clin = checkEdits([claim('C', [{ code: '97110', units: 5 }])], { mue });
  assert.equal(clin.findings[0].severity, 'warning', 'a clinical MUE can be exceeded with documentation');
  assert.match(clin.findings[0].fix, /documentation of medical necessity/);
});

test('a payer pair from memory applies to that payer only and keeps its fact id', () => {
  const pairs = [{ payer: 'Example Health Plan', column_1: '99213', column_2: '81002', note: 'fictional rule', source: 'memory', fact_id: 'f1' }];
  const r = checkEdits([claim('A', [{ code: '99213' }, { code: '81002' }]), claim('B', [{ code: '99213' }, { code: '81002' }], { payer: 'Sample Mutual' })], { payerPairs: pairs.map((p) => ({ ...p })) , ptp: new Map() });
  assert.deepEqual(r.findings.map((f) => [f.claim_id, f.kind, f.fact_id]), [['A', 'payer_pair', 'f1']]);
});

test('lookup works both ways and says whether the edit was active on the date', () => {
  const idx = ptpIndex([{ column_1: '20610', column_2: '20604', modifier_indicator: '1', effective: '20200101', deletion: '20260101' }]);
  const hits = lookupPair(idx, '20604', '20610', '2026-01-05');
  assert.deepEqual([hits.length, hits[0].column_1, hits[0].active_on_date], [1, '20610', false]);
  assert.equal(lookupPair(idx, '20610', '20604', '2025-12-31')[0].active_on_date, true);
});
