import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRuntime } from 'fairclaim-core';
import { manifest, scorePayers } from '../src/index.js';

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const sandbox = () => { const root = mkdtempSync(join(tmpdir(), 'payers-')); cpSync(fixtures, root, { recursive: true }); return root; };
const F = { remits: ['era-2026-01.835', 'era-2026-02.835'], claims: 'claims-submitted.csv', config: 'payer-config.json' };
const paid = (id, payer, date, extra = {}) => ({ claim_id: id, payer, payment_date: date, status: '1', charge: 100, paid: 80, patient_responsibility: 0, adjustments: [{ group: 'CO', reason: '45', amount: 20 }], remarks: [], lines: [], ...extra });

test('a reversal is counted apart, not as a paid claim', () => {
  const r = scorePayers([paid('a', 'X', '2026-01-10'), paid('a', 'X', '2026-01-20', { status: '22', charge: -100, paid: -80 })]);
  assert.equal(r.payers[0].claims, 1); assert.equal(r.payers[0].reversals, 1);
});

test('memory tightens a target and the flag cites it; a looser fact is ignored', () => {
  const sub = new Map([['a', '2026-01-01']]);
  const base = { submitted: sub, config: { targets: { days_to_pay: 30 } } };
  assert.deepEqual(scorePayers([paid('a', 'X', '2026-01-26')], base).payers[0].flags, []);
  const tight = scorePayers([paid('a', 'X', '2026-01-26')], { ...base, facts: [{ id: 'f1', value: { payer: 'x', days_to_pay: 20 } }] }).payers[0].flags;
  assert.equal(tight[0].flag, 'slow'); assert.equal(tight[0].fact_id, 'f1');
  assert.deepEqual(scorePayers([paid('a', 'X', '2026-01-26')], { ...base, facts: [{ id: 'f2', value: { payer: 'X', days_to_pay: 60 } }] }).payers[0].flags, []);
});

test('a target fact needs at least one target', async () => {
  const rt = new AgentRuntime(manifest, { root: sandbox() });
  const r = await rt.call('payers_learn', { kind: 'payer_target', value: { payer: 'X' } });
  assert.equal(r.status, 'error'); assert.match(r.reason, /at least one/);
});

test('the report has the trend section and real names stay out of the result', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  const r = await rt.call('payers_write_report', F);
  assert.equal(r.status, 'executed', r.reason);
  const html = readFileSync(join(root, 'remedy-out/payers/payers.html'), 'utf8');
  assert.match(html, /2026-02/);
  assert.match(readFileSync(join(root, 'remedy-out/payers/payers.csv'), 'utf8'), /^payer,claims/);
});
