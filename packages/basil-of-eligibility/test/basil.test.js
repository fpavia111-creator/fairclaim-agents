import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRuntime } from 'remedy-core';
import { manifest, checkAppointments } from '../src/index.js';

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const sandbox = () => { const root = mkdtempSync(join(tmpdir(), 'basil-')); cpSync(fixtures, root, { recursive: true }); return root; };
const m = (over) => ({ trace: 'T1', member_id: 'M1', active: true, plan_begin: '2025-01-01', plan_end: null, benefits: [{ code: '1', service_types: ['30'] }], rejections: [], other_payers: [], ...over });

test('matching: trace first, then member id; AAA 42 means try again, not "not found"', () => {
  const r = checkAppointments([{ appointment_id: 'T1', date: '2026-02-03' }, { appointment_id: 'X', member_id: 'm-1', date: '2026-02-03' }], [m({})]);
  assert.deepEqual(r.rows.map((x) => x.matched_by), ['trace', 'member_id']);
  assert.equal(checkAppointments([{ appointment_id: 'T1', date: '2026-02-03' }], [m({ rejections: [{ code: '42' }] })]).rows[0].status, 'retry');
});

test('a plan that starts after the visit is inactive for that visit', () => {
  const r = checkAppointments([{ appointment_id: 'T1', date: '2026-02-03' }], [m({ plan_begin: '2026-03-01' })]);
  assert.equal(r.rows[0].status, 'inactive');
});

test('an accepted visit_type_review moves matching active visits to review; others stay ready', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  const f = { appointments: 'appointments-2026-02-03.csv', eligibility: ['eligibility-2026-02-01.271'] };
  const l = await rt.call('basil_learn', { kind: 'visit_type_review', value: { payer: 'Example Health Plan', visit_type: 'specialist', note: 'HMO referral needed' } });
  const ask = await rt.call('basil_accept_learning', { id: l.result.fact.id, decision: 'accept' });
  rt.approvals.approve(ask.approval_id, 'Fran Front Desk (fictional)');
  await rt.call('basil_accept_learning', { id: l.result.fact.id, decision: 'accept' });
  const r = await rt.call('basil_check', f);
  const a7 = r.result.items.find((x) => x.appointment_id === 'A1007');
  assert.equal(a7.status, 'review'); assert.equal(a7.fact_id, l.result.fact.id);
  assert.equal(r.result.items.find((x) => x.appointment_id === 'A1001').status, 'active');
});

test('the call list has real names and MRN-free result; audit has none', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  const r = await rt.call('basil_write_report', { appointments: 'appointments-2026-02-03.csv', eligibility: ['eligibility-2026-02-01.271'] });
  assert.equal(r.status, 'executed', r.reason);
  assert.match(readFileSync(join(root, 'remedy-out/basil/basil-eligibility.csv'), 'utf8'), /Rowan Castellano/);
  assert.doesNotMatch(JSON.stringify(r) + readFileSync(join(root, '.remedy/audit.jsonl'), 'utf8'), /Castellano|DMP000781234/i);
});
