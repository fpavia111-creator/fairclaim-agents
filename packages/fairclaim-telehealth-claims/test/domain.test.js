// Domain checks for telehealth lines against payer rules (ver 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkTelehealth } from '../src/logic.js';

const row = (id, code, o = {}) => ({ claim_id: id, patient_name: 'Pat Example', member_id: o.member || 'M1', payer: o.payer || 'Example Health Plan', provider: o.provider || 'Dr Example', date_of_service: '2026-02-03', code, modifiers: o.mods || '', pos: o.pos ?? '10', patient_state: o.state ?? 'OH', patient_location: o.location ?? 'Home', modality: o.modality ?? 'Audio-video', consent: o.consent });
const run = (rows, config = {}) => checkTelehealth(rows, { config });
const checksOf = (r, id) => r.items.find((i) => i.claim_id === id).issues.map((i) => i.check);

test('an office visit whose modality column says "In person" is not a telehealth line', () => {
  const r = run([row('A', '99213', { pos: '11', modality: 'In person', location: '' }), row('B', '99213', { pos: '11', modality: 'Office', location: '' })]);
  assert.equal(r.telehealth_lines, 0);
});

test('the deleted telephone codes are errors that point to the audio-only codes', () => {
  const r = run([row('T', '99442', { modality: 'Telephone', mods: '93' })]);
  assert.deepEqual(checksOf(r, 'T'), ['deleted_code']);
  assert.match(r.items[0].issues[0].message, /98008-98015/);
});

test('telemedicine codes need a payer that takes them; a payer rule that does is clean', () => {
  const config = { payers: [{ name: 'Sample Mutual', telemedicine_codes: true, pos: ['02', '10'] }] };
  const r = run([row('N', '98002'), row('Y', '98002', { payer: 'Sample Mutual' })], config);
  assert.deepEqual(checksOf(r, 'N'), ['payer_code']);
  assert.deepEqual(checksOf(r, 'Y'), []);
  assert.match(r.items.find((i) => i.claim_id === 'Y').rule, /^your rule: POS 02\/10, audio-only 93, takes 98000-98015$/);
});

test('a payer that wants 95 accepts 93 on an audio-only visit, and flags the older GT', () => {
  const config = { payers: [{ name: 'Example Health Plan', modifier: '95', audio_modifier: '93' }] };
  const r = run([row('V', '99213', { mods: '95' }), row('A', '99213', { mods: '93', modality: 'Audio only' }), row('G', '99213', { mods: 'GT' })], config);
  assert.deepEqual(checksOf(r, 'V'), []);
  assert.deepEqual(checksOf(r, 'A'), []);
  assert.deepEqual(checksOf(r, 'G'), ['modifier', 'modifier']);
});

test('licensing follows the patient: another state is an error, a missing state is a warning, and a provider with no state list is skipped', () => {
  const config = { providers: [{ name: 'Dr Example', states: ['oh', 'KY'] }, { name: 'Dr Nolist' }] };
  const r = run([row('IN', '99213', { state: 'IN', mods: '95' }), row('KY', '99213', { state: 'KY' }), row('NS', '99213', { state: '' }), row('NL', '99213', { provider: 'Dr Nolist', state: 'TX' })], config);
  assert.deepEqual(checksOf(r, 'IN'), ['license']);
  assert.deepEqual(checksOf(r, 'KY'), []);
  assert.deepEqual(r.items.find((i) => i.claim_id === 'NS').issues.map((i) => i.severity), ['warning']);
  assert.deepEqual(checksOf(r, 'NL'), []);
});

test('an in-person visit by the same provider on the same day is a warning on the telehealth visit', () => {
  const r = run([row('T', '99213'), row('O', '99214', { pos: '11', modality: '', location: '' })]);
  assert.deepEqual(r.items.map((i) => [i.claim_id, i.issues.map((x) => x.check)]), [['T', ['same_day']]]);
});

test('audio-only is refused when the payer does not cover it, and an audio code with video is the wrong code', () => {
  const config = { payers: [{ name: 'Example Health Plan', audio_allowed: false, telemedicine_codes: true }] };
  const r = run([row('A', '99213', { modality: 'Phone', mods: '93' }), row('W', '98009', { modality: 'Video' })], config);
  assert.ok(checksOf(r, 'A').includes('audio_only'));
  assert.ok(checksOf(r, 'W').includes('modality'));
});
