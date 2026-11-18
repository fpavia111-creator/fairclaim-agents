// Domain checks for 999 and 277CA rejections tied back to the claims sent (ver 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rejections } from '../src/logic.js';

const sent = [
  { claim_id: 'A', patient_name: 'Pat Example', member_id: 'M1', payer_name: 'Example Health Plan', total_charge: 100, transaction_control: '0001', loop_start: 10, segments: [16, 22] },
  { claim_id: 'B', patient_name: 'Sam Example', member_id: 'M2', payer_name: 'Example Health Plan', total_charge: 250, transaction_control: '0001', loop_start: 23, segments: [29, 35] },
];
const ack999 = (sets) => ({ by_set: { '999': [{ sets }] } });
const set = (o) => ({ set: '837', control: '0001', status: 'rejected', status_code: 'R', accepted: false, errors: [], reason_codes: [], ...o });
const err = (segment_id, position, code, elements = []) => ({ segment_id, position, loop: '2010BA', code, elements });
const ack277 = (claims) => ({ by_set: { '277': [{ claims }] } });
const st = (category, status, entity) => ({ category, status, entity, meaning: '' });

test('a 999 error inside a claim loop names that claim, with the element and the bad value', () => {
  const r = rejections({ acks: [ack999([set({ errors: [err('NM1', 12, '8', [{ position: 9, code: '7', bad_value: 'ABC' }])] })])], claims: sent });
  assert.deepEqual(r.items.map((i) => [i.claim_id, i.scope, i.severity]), [['A', 'claim', 'error']]);
  assert.match(r.items[0].message, /NM1 at segment 12 \(loop 2010BA\): Segment has element errors\. NM1-9: Invalid code value \("ABC"\)\./);
  assert.deepEqual([r.claims_rejected, r.charges_rejected], [1, 100]);
});

test('an error in the billing-provider loop rejects every claim in the transaction', () => {
  const r = rejections({ acks: [ack999([set({ errors: [err('N4', 5, '8')] })])], claims: sent });
  assert.deepEqual(r.items.map((i) => i.claim_id), ['A', 'B']);
  assert.match(r.items[0].fix, /every claim in it must be resent/);
  assert.equal(r.charges_rejected, 350);
});

test('accepted with errors is a warning; a rejection with no segment detail asks the clearinghouse', () => {
  const r = rejections({ acks: [ack999([set({ status: 'accepted_with_errors', status_code: 'E', accepted: true, errors: [err('DTP', 14, '8')] }), set({ control: '0002', errors: [], reason_codes: ['5'] })])], claims: sent });
  assert.deepEqual(r.items.map((i) => [i.claim_id, i.severity]), [['A', 'warning'], [null, 'error']]);
  assert.match(r.items[1].message, /IK5 R 5/);
  assert.equal(r.claims_rejected, 0);
});

test('a 277CA rejection names the status and the entity in words, with the category\'s fix', () => {
  const r = rejections({ acks: [ack277([{ claim_id: 'A', rejected: true, category: 'A7', statuses: [st('A7', '562', '85')], payer: 'Example Health Plan', date: '2026-01-21' }, { claim_id: 'B', rejected: false, statuses: [], date: '2026-01-21' }])], claims: sent });
  assert.equal(r.items.length, 1);
  assert.match(r.items[0].message, /Entity's National Provider Identifier \(NPI\) \(billing provider\)/);
  assert.match(r.items[0].fix, /correct the value and resend as a new original claim/);
});

test('a rejection later accepted after the claim was resent is not work any more', () => {
  const r = rejections({ acks: [ack277([{ claim_id: 'A', rejected: true, category: 'A6', statuses: [st('A6', '21')], date: '2026-01-21' }]), ack277([{ claim_id: 'A', rejected: false, statuses: [], date: '2026-01-24' }, { claim_id: 'B', rejected: false, statuses: [], date: '2026-01-24' }])], claims: sent });
  assert.deepEqual([r.items.length, r.resolved_by_later_acceptance, r.claims_rejected], [0, 1, 0]);
});

test('with a 277CA in hand, a sent claim it does not mention is flagged as not acknowledged; a rejected transaction is not', () => {
  const r = rejections({ acks: [ack277([{ claim_id: 'A', rejected: false, statuses: [], date: '2026-01-21' }])], claims: sent });
  assert.deepEqual(r.items.map((i) => [i.claim_id, i.source, i.severity]), [['B', 'none', 'warning']]);
  const tx = rejections({ acks: [ack277([{ claim_id: 'A', rejected: false, statuses: [], date: '2026-01-21' }]), ack999([set({ errors: [] })])], claims: sent });
  assert.equal(tx.not_acknowledged, 0);
});

test('a clean accepted 999 gives no work and still counts the transaction', () => {
  const r = rejections({ acks: [ack999([set({ status: 'accepted', status_code: 'A', accepted: true })])], claims: sent });
  assert.deepEqual([r.items.length, r.transactions, r.transactions_rejected], [0, 1, 0]);
});

test('a 277CA rejection with no charge takes it from the claim sent, and an unknown status code is shown by number', () => {
  const r = rejections({ acks: [ack277([{ claim_id: 'B', rejected: true, category: 'A3', statuses: [st('A3', '9999')], date: '2026-01-21' }])], claims: sent });
  assert.equal(r.items[0].charge, 250);
  assert.match(r.items[0].message, /status 9999/);
  assert.match(r.items[0].fix, /returned as unprocessable/);
});
