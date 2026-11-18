// Domain checks for credentialing documents and payer enrollment (ver 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { credentialingTasks } from '../src/logic.js';

const prov = (o = {}) => ({ provider: 'Dr Example', npi: '1234567893', license_expires: '2027-06-30', malpractice_expires: '2027-01-01', caqh_attested: '2026-01-10', ...o });
const enr = (status, o = {}) => ({ provider: 'Dr Example', npi: '1234567893', payer: 'Example Health Plan', status, ...o });
const run = (roster, enrollments = [], config = {}, facts = []) => credentialingTasks(roster, enrollments, { config, facts, asOf: '2026-02-15' });
const enrollTasks = (r) => r.tasks.filter((t) => t.item === 'Enrollment').map((t) => t.status);

test('documents: expired, due soon inside the warning window, good after it', () => {
  const r = run([prov({ license_expires: '2026-02-01', malpractice_expires: '2026-04-01', dea_expires: '2026-12-31' })]);
  const by = Object.fromEntries(r.tasks.map((t) => [t.item, t]));
  assert.equal(by['State license'].status, 'expired');
  assert.match(by['State license'].message, /must not work under it/);
  assert.deepEqual([by['Malpractice insurance'].status, by['Malpractice insurance'].days_left], ['due_soon', 45]);
  assert.equal(by['DEA registration'].status, 'ok');
});

test('a bad NPI check digit is an error and goes first', () => {
  const r = run([prov({ npi: '1234567890' })]);
  assert.deepEqual([r.tasks[0].item, r.tasks[0].status], ['NPI', 'error']);
});

test('"Not submitted" and "Not enrolled" are not started, never pending', () => {
  const r = run([], [enr('Not submitted'), enr('Not enrolled', { payer: 'Sample Mutual' }), enr('')]);
  assert.deepEqual(enrollTasks(r), ['not_started', 'not_started', 'not_started']);
});

test('a terminated or inactive enrollment is reported like a denial', () => {
  const r = run([], [enr('Terminated'), enr('Inactive - revalidation missed')]);
  assert.deepEqual(enrollTasks(r), ['denied', 'denied']);
  assert.match(r.tasks[0].message, /no longer active/);
});

test('pending enrollments need a follow-up call after the follow-up days', () => {
  const r = run([], [enr('Submitted', { submitted_date: '2025-12-01' }), enr('In process', { submitted_date: '2026-02-01', payer: 'Sample Mutual' })], { pending_followup_days: 30 });
  const by = Object.fromEntries(r.tasks.map((t) => [t.payer, t]));
  assert.equal(by['Example Health Plan'].status, 'follow_up');
  assert.match(by['Example Health Plan'].message, /Pending 76 days/);
  assert.deepEqual([by['Sample Mutual'].status, by['Sample Mutual'].days_left], ['pending', 16]);
});

test('an enrollment that starts later says not to bill before it; revalidation past due is expired', () => {
  const r = run([], [enr('Approved', { effective_date: '2026-03-01' }), enr('Approved', { payer: 'Sample Mutual', effective_date: '2024-01-01', revalidation_due: '2026-01-31' })]);
  const later = r.tasks.find((t) => t.status === 'not_yet_effective'), reval = r.tasks.find((t) => t.item === 'Revalidation');
  assert.match(later.message, /do not bill this payer for this provider's visits before then/);
  assert.deepEqual([reval.status, reval.payer], ['expired', 'Sample Mutual']);
  assert.equal(r.need_action, 1);
});
