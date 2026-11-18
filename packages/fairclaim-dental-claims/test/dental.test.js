import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRuntime } from 'fairclaim-core';
import { manifest, toothInfo, checkDental } from '../src/index.js';

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const sandbox = () => { const root = mkdtempSync(join(tmpdir(), 'dental-')); cpSync(fixtures, root, { recursive: true }); return root; };
const claim = (lines, o = {}) => ({ claim_id: o.id || 'X1', patient_name: 'A', member_id: o.member || 'M1', patient_dob: o.dob || '1990-01-01', payer_name: o.payer || 'Plan', service_from: o.date || '2026-02-01', lines: lines.map((l, i) => ({ line: i + 1, surfaces: [], ...l, date_from: l.date_from || o.date || '2026-02-01' })) });

test('tooth facts: Universal numbers, primary letters, supernumerary', () => {
  assert.deepEqual([8, 4, 30, 'E', 'K', 58].map((t) => toothInfo(t).kind), ['anterior', 'premolar', 'molar', 'anterior', 'molar', 'supernumerary']);
  assert.equal(toothInfo('33'), null); assert.equal(toothInfo('U'), null);
  assert.equal(toothInfo('AS').supernumerary, true);
});

test('restoration surfaces: count picks the code; 4 or more is one code; incisal on posterior is wrong', () => {
  const r = (code, tooth, surfaces) => checkDental([claim([{ code, tooth, surfaces: surfaces.split('') }])]).items[0];
  assert.equal(r('D2393', '30', 'MOD').status, 'ok');
  assert.equal(r('D2394', '30', 'MODBL').status, 'ok');
  assert.equal(r('D2161', '3', 'MODL').status, 'ok');
  assert.equal(r('D2391', '3', 'I').issues[0].check, 'surfaces');
  assert.match(r('D2140', '3', 'OO').issues[0].message, /listed twice/);
  assert.equal(r('D2391', '3', 'X').issues[0].check, 'surfaces');
});

test('frequency: calendar year resets on January 1; quadrant limits count per quadrant', () => {
  const hist = [{ member_id: 'M1', date_of_service: '2025-12-20', code: 'D0274' }, { member_id: 'M1', date_of_service: '2025-03-01', code: 'D4341', quadrant: 'UR' }];
  const r = checkDental([claim([{ code: 'D0274' }, { code: 'D4341', quadrant: 'UL' }, { code: 'D4341', quadrant: '10', date_from: '2026-02-01' }], { date: '2026-01-05' })], hist);
  const by = Object.fromEntries(r.items.map((i) => [`${i.code}${i.quadrant || ''}`, i.issues.filter((x) => x.check === 'frequency').length]));
  assert.deepEqual(by, { D0274: 0, D4341UL: 0, D434110: 1 });
});

test('an implant on an extracted tooth is fine; a filling is not', () => {
  const hist = [{ member_id: 'M1', date_of_service: '2025-06-01', code: 'D7210', tooth: '19' }];
  const r = checkDental([claim([{ code: 'D6010', tooth: '19' }, { code: 'D2391', tooth: '19', surfaces: ['O'] }])], hist);
  assert.deepEqual(r.items.map((i) => `${i.code}:${i.issues.some((x) => x.check === 'extracted')}`).sort(), ['D2391:true', 'D6010:false']);
});

test('age limits warn above the age, from the date of service', () => {
  const r = checkDental([claim([{ code: 'D1206' }], { dob: '2007-03-01', date: '2026-02-01' })]);
  assert.equal(r.items[0].issues.length, 0, 'aged 18 is within an age_max of 18');
  assert.equal(checkDental([claim([{ code: 'D1206' }], { dob: '2007-01-01', date: '2026-02-01' })]).items[0].issues[0].check, 'age');
});

test('a learned payer limit adds a warning for that payer only, with the fact id', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  const f = { claims: 'dental-claims-2026-02.837', history: 'dental-history.csv', check: 'frequency' };
  const before = (await rt.call('dental_check', f)).result.items.length;
  const l = await rt.call('dental_learn', { kind: 'payer_frequency', value: { payer: 'Example Dental Plan', label: 'Limited exams', codes: ['D0140', 'D0120'], max: 2, calendar_year: true, per: 'patient' } });
  const ask = await rt.call('dental_accept_learning', { id: l.result.fact.id, decision: 'accept' });
  rt.approvals.approve(ask.approval_id, 'Jo Dental Billing Lead (fictional)');
  assert.equal((await rt.call('dental_accept_learning', { id: l.result.fact.id, decision: 'accept' })).status, 'executed');
  const items = (await rt.call('dental_check', f)).result.items;
  assert.equal(items.length, before + 1);
  const hit = items.find((i) => i.fact_id === l.result.fact.id);
  assert.equal(hit.code, 'D0140'); assert.match(hit.issues.find((x) => x.check === 'frequency').message, /for Example Dental Plan/);
});
