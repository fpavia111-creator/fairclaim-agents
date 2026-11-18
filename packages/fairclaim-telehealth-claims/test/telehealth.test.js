import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRuntime } from 'fairclaim-core';
import { manifest, checkTelehealth } from '../src/index.js';

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const sandbox = () => { const root = mkdtempSync(join(tmpdir(), 'telehealth-')); cpSync(fixtures, root, { recursive: true }); return root; };
const row = (o) => ({ claim_id: 'C1', patient_name: 'A', member_id: 'M1', payer: 'Plan', provider: 'Dr A', date_of_service: '2026-02-12', code: '99213', modifiers: '95', pos: '10', patient_state: 'AK', patient_location: 'Home', modality: 'Video', consent: 'yes', ...o });
const checks = (r) => r.items.flatMap((i) => i.issues.map((x) => x.check));

test('an in-person line with no telehealth sign is not checked', () => {
  const r = checkTelehealth([row({ modifiers: '', pos: '11', modality: '' })]);
  assert.equal(r.telehealth_lines, 0); assert.equal(r.lines_checked, 1);
});

test('POS 10 is for home; a patient at a clinic needs 02, and 02 at home needs 10 when the payer takes 10', () => {
  assert.deepEqual(checks(checkTelehealth([row({ patient_location: 'Clinic' })])), ['pos']);
  assert.deepEqual(checks(checkTelehealth([row({ pos: '02' })])), ['pos']);
  assert.deepEqual(checks(checkTelehealth([row({ pos: '02' })], { config: { default_rule: { pos: ['02'] } } })), []);
});

test('audio-only: 93 or FQ satisfies the payer modifier; video codes on a phone call are caught', () => {
  const cfg = { config: { payers: [{ name: 'Plan', modifier: '95', audio_modifier: '93' }] } };
  assert.deepEqual(checks(checkTelehealth([row({ modality: 'Phone', modifiers: '93' })], cfg)), []);
  assert.deepEqual(checks(checkTelehealth([row({ modality: 'Phone', modifiers: '' })], cfg)), ['modifier', 'modifier']);
  assert.ok(checks(checkTelehealth([row({ code: '98003', modality: 'telephone' })], { config: { default_rule: { telemedicine_codes: true } } })).includes('modality'));
});

test('a virtual check-in is not an audio-only visit, but needs consent', () => {
  const r = checkTelehealth([row({ code: '98016', modifiers: '', modality: 'Phone', consent: '' })], { config: { default_rule: { audio_allowed: false } } });
  assert.deepEqual(checks(r), ['consent']);
  assert.equal(checkTelehealth([row({ code: '98016', modifiers: '', consent: 'Verbal' })]).items[0].status, 'ok');
});

test('the originating site fee is judged by where the patient was, not by telehealth POS rules', () => {
  assert.deepEqual(checks(checkTelehealth([row({ code: 'Q3014', pos: '11', modifiers: '', patient_location: 'Rural clinic' })])), []);
  assert.deepEqual(checks(checkTelehealth([row({ code: 'Q3014', pos: '11', modifiers: '' })])), ['originating_site']);
});

test('a learned rule only tightens: a 95 requirement for a payer adds an error with the fact id', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  const f = { visits: 'telehealth-visits-2026-02.csv', config: 'telehealth-config.json' };
  const before = (await rt.call('telehealth_check', f)).result;
  assert.equal(before.items.find((i) => i.claim_id === 'T9013').status, 'ok');
  const loosen = await rt.call('telehealth_learn', { kind: 'payer_telehealth_rule', value: { payer: 'Demo Medicaid Plan', audio_allowed: true } });
  assert.notEqual(loosen.status, 'executed');
  const l = await rt.call('telehealth_learn', { kind: 'payer_telehealth_rule', value: { payer: 'Test Medicare Contractor', modifier: '95', note: 'Denied without 95 (fictional)' } });
  const ask = await rt.call('telehealth_accept_learning', { id: l.result.fact.id, decision: 'accept' });
  rt.approvals.approve(ask.approval_id, 'Lee Telehealth Billing Lead (fictional)');
  assert.equal((await rt.call('telehealth_accept_learning', { id: l.result.fact.id, decision: 'accept' })).status, 'executed');
  const after = (await rt.call('telehealth_check', f)).result;
  const t4 = after.items.find((i) => i.claim_id === 'T9004');
  assert.ok(t4.issues.some((i) => i.message.includes('wants modifier 95')));
  assert.equal(t4.fact_id, l.result.fact.id);
  assert.equal(after.items.find((i) => i.claim_id === 'T9013').status, 'ok');
  assert.equal(after.items.find((i) => i.claim_id === 'T9001').fact_id, undefined);
});
