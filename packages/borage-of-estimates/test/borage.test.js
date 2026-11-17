import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRuntime } from 'remedy-core';
import { manifest, addBusinessDays, businessDaysBetween, gfeDue, compareBills } from '../src/index.js';

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const sandbox = () => { const root = mkdtempSync(join(tmpdir(), 'borage-')); cpSync(fixtures, root, { recursive: true }); return root; };

test('business days skip weekends and holidays', () => {
  assert.equal(addBusinessDays('2026-02-13', 1), '2026-02-16');
  assert.equal(addBusinessDays('2026-02-13', 1, new Set(['2026-02-16'])), '2026-02-17');
  assert.equal(businessDaysBetween('2026-02-13', '2026-02-20'), 5);
});

test('due date edges: 2, 3, 9 and 10 business days ahead', () => {
  assert.equal(gfeDue({ scheduled_on: '2026-02-02', service_date: '2026-02-04' }), null);
  assert.equal(gfeDue({ scheduled_on: '2026-02-02', service_date: '2026-02-05' }).due, '2026-02-03');
  assert.equal(gfeDue({ scheduled_on: '2026-02-02', service_date: '2026-02-13' }).due, '2026-02-03');
  assert.equal(gfeDue({ scheduled_on: '2026-02-02', service_date: '2026-02-16' }).due, '2026-02-05');
  assert.equal(gfeDue({ scheduled_on: '2026-02-02', service_date: '2026-02-16', requested_on: '2026-01-29' }).due, '2026-02-03', 'the earlier due date wins');
});

test('exactly 400 over reaches the threshold', () => {
  assert.equal(compareBills([{ gfe_id: '1', estimate: 100, billed: 500 }]).items[0].status, 'dispute_eligible');
  assert.equal(compareBills([{ gfe_id: '1', estimate: 100, billed: 499.99 }]).items[0].status, 'over_estimate');
});

test('the draft prices planned codes plus codes learned for the visit type', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root, mode: 'auto', autoActions: ['borage_draft_estimate'] });
  const l = await rt.call('borage_learn', { kind: 'visit_type_codes', value: { visit_type: 'new patient', codes: ['93000'], note: 'fictional' } });
  const ask = await rt.call('borage_accept_learning', { id: l.result.fact.id, decision: 'accept' });
  rt.approvals.approve(ask.approval_id, 'Lee Front Desk Lead (fictional)');
  await rt.call('borage_accept_learning', { id: l.result.fact.id, decision: 'accept' });
  const d = await rt.call('borage_draft_estimate', { schedule: 'self-pay-schedule.csv', prices: 'self-pay-prices.csv', config: 'estimate-config.json', appointment_id: 'G2' });
  assert.equal(d.status, 'executed', d.reason);
  assert.equal(d.result.amount, 255);
  assert.deepEqual(d.result.fact_ids, [l.result.fact.id]);
  const text = readFileSync(join(root, d.result.draft), 'utf8');
  assert.match(text, /Juniper Okafor/); assert.match(text, /\| 93000 \| ECG with report \| 1 \| 45 \| 45 \|/);
  assert.match(text, /\[MISSING: diagnosis codes, if known\]/);
  assert.doesNotMatch(JSON.stringify(d), /Okafor/);
});
