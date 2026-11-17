import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRuntime } from 'remedy-core';
import { manifest, dueDates, maxMonths, reviewPlans } from '../src/index.js';

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const sandbox = () => { const root = mkdtempSync(join(tmpdir(), 'savory-')); cpSync(fixtures, root, { recursive: true }); return root; };

test('due dates: day after the start moves to next month; day 31 is capped at 28', () => {
  assert.deepEqual(dueDates('2026-01-20', 15, '2026-04-01'), ['2026-02-15', '2026-03-15']);
  assert.deepEqual(dueDates('2026-01-01', 31, '2026-03-01'), ['2026-01-28', '2026-02-28']);
});

test('term tiers', () => {
  const t = [{ up_to: 500, max_months: 6 }, { up_to: 2000, max_months: 12 }];
  assert.equal(maxMonths(500, t), 6); assert.equal(maxMonths(501, t), 12); assert.equal(maxMonths(9999, t), 12);
});

test('memory shortens the grace period, never lengthens it', () => {
  const plans = [{ plan_id: 'X', original_balance: 300, monthly_amount: 100, start_date: '2026-02-01', day_of_month: 1 }];
  assert.equal(reviewPlans(plans, [], { asOf: '2026-02-08' }).items[0].status, 'current');
  const r = reviewPlans(plans, [], { asOf: '2026-02-08', facts: [{ id: 'f', value: { grace_days: 5 } }] });
  assert.equal(r.items[0].status, 'missed_payment'); assert.equal(r.items[0].fact_id, 'f');
  assert.equal(reviewPlans(plans, [], { asOf: '2026-02-08', config: { grace_days: 5 }, facts: [{ id: 'g', value: { grace_days: 30 } }] }).grace_days, 5);
});

test('payments recorded by account count toward the plan', () => {
  const r = reviewPlans([{ plan_id: 'X', account: 'A1', original_balance: 200, monthly_amount: 100, start_date: '2026-01-01', day_of_month: 1 }], [{ account: 'A1', amount: 100, date: '2026-01-01' }], { asOf: '2026-01-20' });
  assert.equal(r.items[0].paid, 100); assert.equal(r.items[0].status, 'current');
});

test('the agreement draft states the last payment and leaves signature open', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root, mode: 'auto', autoActions: ['savory_draft_plan_agreement'] });
  const d = await rt.call('savory_draft_plan_agreement', { balance: 1250, months: 12, first_due: '2026-03-01', config: 'plan-config.json' });
  assert.equal(d.status, 'executed', d.reason);
  const text = readFileSync(join(root, d.result.draft), 'utf8');
  assert.match(text, /12 monthly payment\(s\) of \*\*104\.17\*\* \(the last one 104\.13\)/);
  assert.match(text, /last payment due 2027-02-01/);
  assert.match(text, /\[MISSING: guarantor signature and date\]/);
});
