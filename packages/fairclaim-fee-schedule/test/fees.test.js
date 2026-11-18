import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRuntime } from 'fairclaim-core';
import { manifest, priceRvu, pickLocality, reviewFees } from '../src/index.js';

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const sandbox = () => { const root = mkdtempSync(join(tmpdir(), 'fees-')); cpSync(fixtures, root, { recursive: true }); return root; };
const F = { fees: 'fee-schedule.csv', rvu: 'rvu-illustrative.csv', gpci: 'gpci-illustrative.csv', config: 'fee-config.json' };

test('RVU x GPCI x CF, facility and non-facility', () => {
  const rvu = { work: 1, pe_nonfac: 2, pe_fac: 0.5, mp: 0.1 }; const g = { work: 1, pe: 1, mp: 1 };
  assert.equal(priceRvu(rvu, g, 30), 93); assert.equal(priceRvu(rvu, g, 30, 'facility'), 48);
});

test('locality matching: exact, partial, ambiguous, missing', () => {
  const rows = [{ locality: 'Rest of State', work_gpci: 1, pe_gpci: 1, mp_gpci: 1 }, { locality: 'Metro City', work_gpci: 1, pe_gpci: 1.1, mp_gpci: 1 }, { locality: 'Metro City Suburbs', work_gpci: 1, pe_gpci: 1.05, mp_gpci: 1 }];
  assert.equal(pickLocality(rows, 'metro city').pe, 1.1);
  assert.throws(() => pickLocality(rows, 'metro'), /matches 2 rows/);
  assert.throws(() => pickLocality(rows, 'nowhere'), /not in the GPCI file/);
});

test('a target from memory only raises the bar', () => {
  const rvu = [{ code: '20610', status: 'A', work_rvu: 1, pe_nonfac: 1, mp_rvu: 0 }]; const g = [{ locality: 'X', work_gpci: 1, pe_gpci: 1, mp_gpci: 1 }];
  const run = (facts) => reviewFees([{ code: '20610', fee: 130 }], rvu, g, { config: { conv_factor: 50, target_percent: 120 }, facts }).rows[0];
  assert.equal(run([]).status, 'ok');
  const up = run([{ id: 'f1', value: { codes: ['2*'], percent: 150 } }]);
  assert.equal(up.status, 'below_target'); assert.equal(up.target_fee, 150); assert.equal(up.fact_id, 'f1');
  assert.equal(run([{ id: 'f2', value: { codes: ['2*'], percent: 50 } }]).target_percent, 120);
});

test('the fee update draft lists only low fees, rounds up, keeps checks open', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root, mode: 'auto', autoActions: ['fees_draft_fee_update'] });
  const d = await rt.call('fees_draft_fee_update', { ...F, as_of: '2026-02-15' });
  assert.equal(d.status, 'executed', d.reason);
  const text = readFileSync(join(root, d.result.draft), 'utf8');
  assert.match(text, /\| 99214 \| [^|]* \| 150 \| 159\.99 \| 239\.99 \| 240 \| 600 \| 54000 \|/);
  assert.doesNotMatch(text, /\| 93000 /);
  assert.match(text, /\[TO CONFIRM: effective date\]/);
  const req = await rt.call('fees_request_go_live', { draft: d.result.draft, draft_sha256: d.result.draft_sha256 });
  assert.equal(req.status, 'needs_approval', 'go_live is a one-click category even in Auto');
  rt.approvals.approve(req.approval_id, 'Lee Practice Manager (fictional)');
  const again = await rt.call('fees_request_go_live', { draft: d.result.draft, draft_sha256: d.result.draft_sha256 });
  assert.equal(again.status, 'error'); assert.match(again.reason, /open markers/);
});
