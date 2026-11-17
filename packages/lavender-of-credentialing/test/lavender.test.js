import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRuntime, validateIcs } from 'remedy-core';
import { manifest, credentialingTasks } from '../src/index.js';

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const sandbox = () => { const root = mkdtempSync(join(tmpdir(), 'lavender-')); cpSync(fixtures, root, { recursive: true }); return root; };
const F = { roster: 'provider-roster.csv', enrollments: 'payer-enrollments.csv', config: 'credentialing-config.json', as_of: '2026-02-15' };

test('CAQH is due 120 days after the last attestation; caqh false turns it off', () => {
  const roster = [{ provider: 'X', npi: '1990000014', license_expires: '2030-01-01', malpractice_expires: '2030-01-01', caqh_attested: '2026-01-01' }];
  const t = credentialingTasks(roster, [], { asOf: '2026-02-01' }).tasks.find((x) => x.item === 'CAQH re-attestation');
  assert.equal(t.due, '2026-05-01'); assert.equal(t.status, 'due_soon');
  const none = credentialingTasks([{ ...roster[0], caqh_attested: '' }], [], { asOf: '2026-02-01', config: { caqh: false } });
  assert.equal(none.tasks.filter((x) => x.item === 'CAQH re-attestation').length, 0);
});

test('a required document with no date is missing; an optional one is not', () => {
  const r = credentialingTasks([{ provider: 'X', npi: '1990000014', license_expires: '2030-01-01', caqh_attested: '2026-01-01' }], [], { asOf: '2026-02-01' });
  assert.deepEqual(r.tasks.filter((x) => x.status === 'missing').map((x) => x.item), ['Malpractice insurance']);
});

test('a learned payer lead time brings the Medicaid revalidation forward, never back', () => {
  const enr = [{ provider: 'V', npi: '1990000055', payer: 'Demo Medicaid Plan', status: 'Enrolled', effective_date: '2022-02-01', revalidation_due: '2026-07-01' }];
  assert.equal(credentialingTasks([], enr, { asOf: '2026-02-15' }).tasks[0].status, 'ok');
  const t = credentialingTasks([], enr, { asOf: '2026-02-15', facts: [{ id: 'f1', value: { payer: 'demo medicaid plan', lead_days: 150 } }] }).tasks[0];
  assert.equal(t.status, 'due_soon'); assert.equal(t.fact_id, 'f1'); assert.match(t.message, /150-day lead from memory/);
  const shorter = credentialingTasks([], enr, { asOf: '2026-02-15', config: { warn_days: 200 }, facts: [{ id: 'f2', value: { payer: 'Demo Medicaid Plan', lead_days: 30 } }] }).tasks[0];
  assert.equal(shorter.status, 'due_soon'); assert.equal(shorter.fact_id, undefined);
});

test('learning a lead time through the tools needs a named person, then flags Vance', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  const due = async () => (await rt.call('lavender_tasks', { ...F, provider: 'vance', status: 'due_soon' })).result.items;
  assert.equal((await due()).length, 0);
  const l = await rt.call('lavender_learn', { kind: 'payer_lead_days', value: { payer: 'Demo Medicaid Plan', lead_days: 150, note: 'State portal takes four months (fictional)' } });
  const ask = await rt.call('lavender_accept_learning', { id: l.result.fact.id, decision: 'accept' });
  assert.equal(ask.status, 'needs_approval');
  rt.approvals.approve(ask.approval_id, 'Kai Credentialing Lead (fictional)');
  assert.equal((await rt.call('lavender_accept_learning', { id: l.result.fact.id, decision: 'accept' })).status, 'executed');
  const items = await due();
  assert.equal(items.length, 1); assert.equal(items[0].item, 'Revalidation'); assert.equal(items[0].fact_id, l.result.fact.id);
});

test('the report writes a valid calendar with a reminder 30 and 7 days before each due date', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  const r = await rt.call('lavender_write_report', { ...F, out_dir: 'out' });
  assert.equal(r.status, 'executed', r.reason);
  const ics = readFileSync(join(root, 'out', 'lavender-due-dates.ics'), 'utf8');
  const v = validateIcs(ics);
  assert.ok(v.ok, v.errors.join('; ')); assert.equal(v.events, r.result.calendar_events);
  assert.match(ics, /TRIGGER:-P30D/); assert.match(ics, /TRIGGER:-P7D/);
  assert.match(ics, /20260228/);
  const csv = readFileSync(join(root, 'out', 'lavender-credentialing.csv'), 'utf8');
  assert.match(csv.split(/\r?\n/)[0], /owner/);
});
