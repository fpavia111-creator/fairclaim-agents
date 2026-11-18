import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRuntime } from 'fairclaim-core';
import { manifest, compareRates, contractCalendar } from '../src/index.js';

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const sandbox = () => { const root = mkdtempSync(join(tmpdir(), 'contracts-')); cpSync(fixtures, root, { recursive: true }); return root; };
const F = { payer_fees: 'payer-fees-2026.csv', medicare: 'medicare-2026-illustrative.csv', volumes: 'volumes-2025.csv', config: 'contract-config.json' };

test('weighting by volume changes the ranking', () => {
  const fees = [{ payer: 'A', code: '1', allowed: 200 }, { payer: 'A', code: '2', allowed: 50 }, { payer: 'B', code: '1', allowed: 100 }, { payer: 'B', code: '2', allowed: 150 }];
  const med = [{ code: '1', amount: 100 }, { code: '2', amount: 100 }];
  assert.equal(compareRates(fees, { medicare: med, volumes: [{ code: '1', volume: 1 }, { code: '2', volume: 9 }] }).payers[0].payer, 'B');
  assert.equal(compareRates(fees, { medicare: med, volumes: [{ code: '1', volume: 9 }, { code: '2', volume: 1 }] }).payers[0].payer, 'A');
});

test('the highest floor wins; memory can raise it, never lower it', () => {
  const fees = [{ payer: 'A', code: '1', allowed: 105 }]; const med = [{ code: '1', amount: 100 }];
  assert.equal(compareRates(fees, { medicare: med, config: { floor_percent: 100 } }).below_floor, 0);
  const up = compareRates(fees, { medicare: med, config: { floor_percent: 100 }, facts: [{ id: 'f1', value: { payer: 'a', percent_of_medicare: 110 } }] });
  assert.equal(up.below_floor, 1); assert.equal(up.lines[0].fact_id, 'f1');
  assert.equal(compareRates(fees, { medicare: med, config: { floor_percent: 110 }, facts: [{ id: 'f2', value: { payer: 'A', percent_of_medicare: 50 } }] }).lines[0].floor_percent, 110);
});

test('calendar: a non-renewing contract with a passed deadline still running is notice_passed', () => {
  const r = contractCalendar([{ payer: 'A', end_date: '2026-03-01', notice_days: 60, auto_renew: 'no' }], { asOf: '2026-02-15' });
  assert.equal(r[0].status, 'notice_passed');
});

test('rate request draft: only codes below the floor, marked for a person', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root, mode: 'auto', autoActions: ['contracts_draft_rate_request'] });
  const d = await rt.call('contracts_draft_rate_request', { ...F, payer: 'sample mutual insurance' });
  assert.equal(d.status, 'executed', d.reason);
  const text = readFileSync(join(root, d.result.draft), 'utf8');
  assert.match(text, /\| 20610 \| 59\.4 \| 66 \| 90% \| 66 \| 210 \|/);
  assert.doesNotMatch(text, /\| 99213 /);
  assert.match(text, /\*\*To:\*\* Provider Contracting, Sample Mutual Insurance \(fictional\)/);
  const none = await rt.call('contracts_draft_rate_request', { ...F, payer: 'Example Health Plan' });
  assert.equal(none.status, 'error'); assert.match(none.reason, /nothing to ask for/);
});
