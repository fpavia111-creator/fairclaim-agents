import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRuntime } from 'remedy-core';
import { manifest, ageClaims, filingLimit } from '../src/index.js';

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const sandbox = () => { const root = mkdtempSync(join(tmpdir(), 'chamomile-')); cpSync(fixtures, root, { recursive: true }); return root; };
const F = { ar: 'open-ar-2026-02-15.csv', config: 'ar-config.json', as_of: '2026-02-15' };

test('the shortest filing limit wins; the default is only a fallback', () => {
  const cfg = { payers: [{ name: 'X Plan', timely_days: 90 }], default_timely_days: 365 };
  assert.equal(filingLimit(cfg, [{ id: 'f1', value: { payer: 'x plan', days: 60 } }], 'X Plan').days, 60);
  assert.equal(filingLimit(cfg, [{ id: 'f1', value: { payer: 'X Plan', days: 120 } }], 'X Plan').days, 90);
  assert.deepEqual(filingLimit(cfg, [], 'Other'), { days: 365, source: 'default' });
  assert.equal(filingLimit({}, [], 'Other'), null);
});

test('bucket edges and the quiet window', () => {
  const r = ageClaims([
    { claim_id: 'a', payer: 'P', balance: 10, date_of_service: '2026-01-01', submitted_date: '2026-01-02' },
    { claim_id: 'b', payer: 'P', balance: 10, date_of_service: '2025-12-31', submitted_date: '2026-01-02', last_activity: '2026-01-25' },
    { claim_id: 'c', payer: 'P', balance: 10, date_of_service: '2025-12-01', submitted_date: '2025-12-02' },
    { claim_id: 'd', payer: 'P', balance: -5, date_of_service: '2025-12-01' },
  ], { config: { payers: [{ name: 'P', timely_days: 365 }] }, asOf: '2026-01-31' });
  const by = Object.fromEntries(r.items.map((i) => [i.claim_id, i]));
  assert.equal(by.a.bucket, '0-30'); assert.equal(by.b.bucket, '31-60');
  assert.equal(by.b.flag, 'waiting', 'worked 6 days ago');
  assert.equal(by.c.flag, 'follow_up');
  assert.equal(r.claims_open, 3, 'credits are not open A/R');
});

test('memory can make a limit shorter (claim moves to past the limit) but never longer', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  const learn = async (days) => {
    const l = await rt.call('chamomile_learn', { kind: 'timely_filing', value: { payer: 'Sample Mutual Insurance', days, note: 'fictional provider manual' } });
    const ask = await rt.call('chamomile_accept_learning', { id: l.result.fact.id, decision: 'accept' });
    rt.approvals.approve(ask.approval_id, 'Lee Billing Lead (fictional)');
    const ok = await rt.call('chamomile_accept_learning', { id: l.result.fact.id, decision: 'accept' });
    assert.equal(ok.status, 'executed', ok.reason);
    return l.result.fact.id;
  };
  await learn(120);
  let e = await rt.call('chamomile_explain', { ...F, claim_id: 'A1002' });
  assert.equal(e.result.claim.filing_limit, 90); assert.equal(e.result.claim.flag, 'file_now');
  const id = await learn(60);
  e = await rt.call('chamomile_explain', { ...F, claim_id: 'A1002' });
  assert.equal(e.result.claim.filing_limit, 60); assert.equal(e.result.claim.flag, 'past_filing_limit');
  assert.equal(e.result.claim.fact_id, id);
});

test('the report file keeps real names; the model sees pseudonyms', async () => {
  const root = sandbox();
  const rt = new AgentRuntime(manifest, { root });
  const a = await rt.call('chamomile_age', F);
  assert.doesNotMatch(JSON.stringify(a), /Okafor/);
  const r = await rt.call('chamomile_write_report', { ...F, language: 'fr' });
  assert.equal(r.status, 'executed', r.reason);
  const csv = readFileSync(join(root, 'remedy-out/chamomile/chamomile-ar.csv'), 'utf8');
  assert.match(csv, /Juniper Okafor/);
  assert.match(csv.split('\n')[1], /A1002/);
  const html = readFileSync(join(root, 'remedy-out/chamomile/chamomile-ar.html'), 'utf8');
  assert.match(html, /lang="fr"/);
});

test('write-offs and payer calls are refused', async () => {
  const rt = new AgentRuntime(manifest, { root: sandbox() });
  for (const t of ['write_off_post', 'payer_call']) assert.equal((await rt.call(t, {})).status, 'blocked');
});
