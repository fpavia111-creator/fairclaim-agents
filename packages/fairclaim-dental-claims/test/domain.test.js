// Domain checks for dental claim lines (ver 2): endodontics, quadrants, duplicates, same-day rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDental, toothInfo } from '../src/logic.js';

const claim = (lines, o = {}) => ({ claim_id: o.id || 'X1', patient_name: 'A', member_id: o.member || 'M1', patient_dob: o.dob || '1990-01-01', payer_name: o.payer || 'Plan', service_from: o.date || '2026-02-01', lines: lines.map((l, i) => ({ line: i + 1, surfaces: [], ...l, date_from: l.date_from || o.date || '2026-02-01' })) });
const checks = (item) => item.issues.map((i) => i.check);

test('root canal code must fit the tooth: a molar code on a front tooth names the right code', () => {
  const r = checkDental([claim([{ code: 'D3330', tooth: '8' }, { code: 'D3320', tooth: '5' }, { code: 'D3310', tooth: 'E' }], { dob: '2018-01-01' })]).items;
  const bad = r.find((i) => i.tooth === '8');
  assert.match(bad.issues[0].message, /bill D3310/);
  assert.deepEqual(r.filter((i) => i.tooth !== '8').map((i) => i.status), ['ok', 'ok'], 'premolar code on 5; primary teeth are not checked');
});

test('scaling and root planing needs a quadrant: letters and numbers both count, other text does not', () => {
  const r = checkDental([claim([{ code: 'D4342', quadrant: 'ur' }, { code: 'D4342', quadrant: '30' }, { code: 'D4342', quadrant: 'upper' }, { code: 'D4341' }])]).items;
  assert.deepEqual(r.map((i) => checks(i).includes('quadrant')).sort(), [false, false, true, true]);
  assert.match(r.find((i) => i.quadrant === 'upper').issues.find((x) => x.check === 'quadrant').message, /"upper" is not one/);
});

test('a duplicate line is flagged once, on the second copy, even across two claims', () => {
  const r = checkDental([claim([{ code: 'D2391', tooth: '30', surfaces: ['O'] }], { id: 'A1' }), claim([{ code: 'D2391', tooth: '30', surfaces: ['O'] }], { id: 'A2' })]).items;
  assert.deepEqual(r.map((i) => `${i.claim_id}:${checks(i).includes('duplicate')}`).sort(), ['A1:false', 'A2:true']);
});

test('scaling and root planing with a cleaning the same day is a warning', () => {
  const r = checkDental([claim([{ code: 'D1110' }, { code: 'D4341', quadrant: 'LL' }])]).items;
  assert.ok(r.find((i) => i.code === 'D4341').issues.some((x) => x.check === 'same_day'));
});

test('a primary tooth on an adult is questioned; a supernumerary primary tooth is not', () => {
  const adult = (tooth) => checkDental([claim([{ code: 'D7140', tooth }], { dob: '1990-01-01' })]).items[0];
  assert.match(adult('K').issues[0].message, /Primary tooth K on a patient aged 36/);
  assert.equal(adult('KS').status, 'ok');
  assert.equal(checkDental([claim([{ code: 'D7140', tooth: 'K' }], { dob: '2018-05-01' })]).items[0].status, 'ok');
});

test('a crown with nothing wrong asks only for its attachment; a non-CDT code is an error', () => {
  const r = checkDental([claim([{ code: 'D2740', tooth: '14' }, { code: '99213' }])]).items;
  const crown = r.find((i) => i.code === 'D2740');
  assert.equal(crown.status, 'attach'); assert.match(crown.issues[0].message, /pre-operative x-ray/);
  assert.equal(r.find((i) => i.code === '99213').issues[0].check, 'code');
});

test('fillings, extractions and sealants need a tooth; a sealant is limited per tooth, not per patient', () => {
  assert.deepEqual(checks(checkDental([claim([{ code: 'D7140' }])]).items[0]), ['tooth']);
  const hist = [{ member_id: 'M1', date_of_service: '2024-06-01', code: 'D1351', tooth: '3' }];
  const r = checkDental([claim([{ code: 'D1351', tooth: '3' }, { code: 'D1351', tooth: '14' }], { dob: '2014-01-01' })], hist).items;
  assert.deepEqual(r.map((i) => `${i.tooth}:${checks(i).includes('frequency')}`).sort(), ['14:false', '3:true']);
  assert.equal(toothInfo('19').kind, 'molar');
});

test('an Open Dental procedure-log query is read by its database column names, and only completed procedures count', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { AgentRuntime } = await import('fairclaim-core');
  const { manifest } = await import('../src/index.js');
  const root = mkdtempSync(join(tmpdir(), 'dental-od-'));
  writeFileSync(join(root, 'od.csv'), 'ClaimNum,PatNum,LName,FName,Birthdate,ProcDate,ProcCode,ToothNum,Surf,ProcFee,ProcStatus\n'
    + '901,11,Example,Pat,1980-02-02,2026-02-03,D2392,30,MO,180,2\n'
    + '901,11,Example,Pat,1980-02-02,2026-02-03,D2740,19,,1200,1\n'
    + '902,12,Example,Sam,1975-03-03,2026-02-04,D1110,,,110,C\n');
  const rt = new AgentRuntime(manifest, { root, audit: false });
  const ins = await rt.call('dental_inspect', { claims: 'od.csv' }).catch(() => null);
  const out = await rt.call('dental_check', { claims: 'od.csv' });
  assert.ok(!out.isError, JSON.stringify(out).slice(0, 300));
  const codes = JSON.stringify(out.result);
  assert.ok(codes.includes('D2392') && codes.includes('D1110'), 'completed procedures are read');
  assert.ok(!codes.includes('D2740'), 'a treatment-planned crown is not checked as billed');
  if (ins && ins.result) assert.match(JSON.stringify(ins.result), /Open Dental/);
});
