// Domain checks for go-live readiness (ver 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkReadiness, statusOf, einValid, taxonomyValid } from '../src/logic.js';

const practice = (o = {}) => ({ name: 'Example Clinic', billing_npi: '1234567893', tax_id: '12-3456789', address: { street: '1 Example Way', city: 'Columbus', state: 'OH', zip: '43004-1234' }, ...o });
const roster = [{ provider: 'Dr A Example', npi: '1245319599', taxonomy: '207Q00000X', license_state: 'OH' }];
const ready = (o = {}) => [{ payer: 'Example Health Plan', payer_id: 'EHP01', edi: 'Approved', era: 'Approved', eft: 'Approved', ...o.group }, { payer: 'Example Health Plan', provider: 'Dr A Example', credentialing: 'Approved', ...o.prov }];
const run = (o = {}) => checkReadiness({ setup: { practice: practice(o.practice), go_live: '2026-03-02', ...o.setup }, roster: o.roster || roster, enrollments: o.enrollments || ready(), fees: o.fees ?? null, claims: o.claims || [], facts: o.facts || [], asOf: '2026-02-15' });
const errs = (r) => r.items.filter((i) => i.severity === 'error').map((i) => `${i.area}:${i.subject}`);

test('the billing address must be a street address with a nine-digit ZIP; a PO box goes in the pay-to address', () => {
  const r = run({ practice: { address: { street: 'PO Box 100', city: 'Columbus', state: 'OH', zip: '43004' } } });
  const msgs = r.items.filter((i) => i.subject === 'billing address').map((i) => i.message);
  assert.equal(msgs.length, 2);
  assert.match(msgs.join(' '), /PO box.*pay-to address/);
  assert.match(msgs.join(' '), /full nine-digit ZIP/);
  assert.equal(r.ready, false);
});

test('EIN and taxonomy shapes', () => {
  assert.deepEqual(['12-3456789', '123456789', '00-1234567', '12-345678'].map(einValid), [true, true, false, false]);
  assert.deepEqual(['207Q00000X', '207q00000x', '207Q00000', '207Q0000XX'].map(taxonomyValid), [true, true, false, true]);
});

test('a pending EDI enrollment submitted too close to go-live is an error; ERA and EFT pending are warnings', () => {
  const r = run({ enrollments: ready({ group: { edi: 'Pending', era: 'Submitted', eft: '', submitted_date: '2026-02-20' } }) });
  const enr = Object.fromEntries(r.items.filter((i) => i.enrollment && i.enrollment !== 'credentialing').map((i) => [i.enrollment, i.severity]));
  assert.deepEqual(enr, { edi: 'error', era: 'warning', eft: 'warning' });
  assert.match(r.items.find((i) => i.enrollment === 'eft').message, /paper checks/);
});

test('a learned lead time shorter than the default is ignored even when passed straight to the check', () => {
  const r = run({ enrollments: ready({ group: { edi: 'Pending', submitted_date: '2026-02-10' } }), facts: [{ id: 'f1', value: { payer: 'Example Health Plan', days: 5 } }] });
  const edi = r.items.find((i) => i.enrollment === 'edi');
  assert.match(edi.message, /lead time for this payer is 30 days/);
  assert.equal(edi.fact_id, undefined);
});

test('charges for a payer with no enrollment, a provider not on the roster and a code with no fee are errors', () => {
  const claims = [{ payer_name: 'Sample Mutual', provider: 'Dr Z Nobody', lines: [{ code: '99213' }, { code: '36415' }] }];
  const r = run({ claims, fees: [{ code: '99213', fee: 120 }, { code: '93000', fee: '' }] });
  assert.deepEqual(errs(r).filter((e) => !e.startsWith('enrollment')).sort(), ['fees:36415', 'fees:93000', 'payers:Sample Mutual', 'providers:Dr Z Nobody']);
  assert.equal(run({ claims }).items.find((i) => i.area === 'fees').severity, 'warning', 'no fee schedule loaded is a warning');
});

test('one payer ID used for two payers, and a payer with two IDs, are warnings to confirm', () => {
  const enrollments = [...ready(), { payer: 'Example Health Plan', payer_id: 'EHP02', edi: 'Approved' }, { payer: 'Sample Mutual', payer_id: 'EHP01', edi: 'Approved', era: 'Approved', eft: 'Approved' }, { payer: 'Sample Mutual', provider: 'Dr A Example', credentialing: 'Approved' }];
  const r = run({ enrollments });
  const w = r.items.filter((i) => i.area === 'payers').map((i) => i.message);
  assert.ok(w.some((m) => /More than one payer ID \(EHP01, EHP02\)/.test(m)));
  assert.ok(w.some((m) => /Payer ID EHP01 is used for 2 payers/.test(m)));
  assert.equal(statusOf('Awaiting payer'), 'pending');
});
