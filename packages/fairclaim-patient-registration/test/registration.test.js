import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRuntime } from 'fairclaim-core';
import { manifest, mbiValid, safePattern, checkRegistrations, duplicates } from '../src/index.js';

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const sandbox = () => { const root = mkdtempSync(join(tmpdir(), 'registration-')); cpSync(fixtures, root, { recursive: true }); return root; };
const F = { patients: 'registrations-2026-02.csv', config: 'registration-config.json', as_of: '2026-02-15' };

test('MBI shape: excluded letters and positions', () => {
  assert.ok(mbiValid('7XK2W40HN38'));
  assert.ok(mbiValid('7XK2-W40-HN38'), 'dashes are allowed as printed on cards');
  assert.ok(!mbiValid('7SK2W40HN38'), 'S is never used');
  assert.ok(!mbiValid('0XK2W40HN38'), 'first character is 1-9');
  assert.ok(!mbiValid('123456789A'), 'old SSN-based id');
});

test('person-supplied patterns are anchored and slow ones refused', () => {
  assert.ok(safePattern('EHP\\d{9}').test('ehp123456789'));
  assert.ok(!safePattern('EHP\\d{9}').test('XEHP123456789'));
  assert.throws(() => safePattern('(a+)+'), /repeat a group/);
  assert.throws(() => safePattern('(a)\\1'), /back-references/);
});

test('self-pay needs no member id; relationship words', () => {
  const r = checkRegistrations([{ mrn: '1', patient_name: 'A B', dob: '1980-01-01', payer: 'Self Pay' }, { mrn: '2', patient_name: 'C D', dob: '1980-01-01', payer: 'X', member_id: '1', relationship: 'Spouse', subscriber_name: 'E D', subscriber_dob: '1979-01-01' }], { asOf: '2026-01-01' });
  assert.deepEqual(r.issues, []);
});

test('duplicates need the same birth date', () => {
  assert.equal(duplicates([{ mrn: '1', patient_name: 'Ann Lee', dob: '1980-01-01' }, { mrn: '2', patient_name: 'Ann Lee', dob: '1980-01-02' }]).length, 0);
  assert.equal(duplicates([{ mrn: '1', patient_name: 'Ann Lee', dob: '1980-01-01' }, { mrn: '2', patient_name: 'Lee, Ann', dob: '1980-01-01' }]).length, 1);
});

test('memory adds a member id pattern; a slow pattern is refused at learn time', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  const bad = await rt.call('registration_learn', { kind: 'payer_member_id_pattern', value: { payer: 'Example Health Plan', pattern: '(\\d+)+' } });
  assert.equal(bad.status, 'error'); assert.match(bad.reason, /repeat a group/);
  const l = await rt.call('registration_learn', { kind: 'payer_member_id_pattern', value: { payer: 'Example Health Plan', pattern: 'EHP2\\d{8}', note: 'fictional: new cards start EHP2' } });
  const ask = await rt.call('registration_accept_learning', { id: l.result.fact.id, decision: 'accept' });
  rt.approvals.approve(ask.approval_id, 'Lee Front Desk Lead (fictional)');
  assert.equal((await rt.call('registration_accept_learning', { id: l.result.fact.id, decision: 'accept' })).status, 'executed');
  const r = await rt.call('registration_check', { ...F, check: 'member_id_pattern' });
  const mem = r.result.items.filter((i) => i.source === 'memory');
  assert.ok(mem.length >= 3, 'EHP ids starting EHP1 now flagged');
  assert.ok(mem.every((i) => i.fact_id === l.result.fact.id));
  assert.equal(r.result.items.filter((i) => i.source === 'config').length, 1, 'config checks unchanged');
});

test('the report keeps real names, chart numbers and the duplicate pair', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  const r = await rt.call('registration_write_report', F);
  assert.equal(r.status, 'executed', r.reason);
  const csv = readFileSync(join(root, 'remedy-out/registration/registration.csv'), 'utf8');
  assert.match(csv, /possible_duplicate,M-1101,Harlow Pembertin/);
  assert.match(csv, /Chart M-1001 has the same birth date/);
});
