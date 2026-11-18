// Domain checks for lab claims (ver 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkLabs } from '../src/logic.js';

const claim = (id, codes, o = {}) => ({ claim_id: id, patient_name: 'Pat Example', member_id: o.member || 'M1', payer_name: o.payer || 'Example Health Plan', clia: o.clia ?? '36D0999999', service_from: o.date || '2026-02-10', diagnoses: (o.dx || ['E11.9']).map((code) => ({ code })), lines: codes.map((c, i) => { const [code, ...mods] = c.split('-'); return { line: i + 1, code, modifiers: mods, units: 1, charge: 10, date_from: o.date || '2026-02-10' }; }) });
const checks = (r, id) => r.items.find((i) => i.claim_id === id).issues.map((i) => i.check);

test('the lipid panel components billed one by one are caught; with the panel they are a duplicate', () => {
  const r = checkLabs([claim('U', ['82465', '83718', '84478']), claim('D', ['80061', '83718'], { member: 'M2' })]);
  assert.deepEqual(checks(r, 'U'), ['unbundled_panel']);
  assert.match(r.items.find((i) => i.claim_id === 'U').issues[0].message, /bill 80061/);
  assert.deepEqual(checks(r, 'D'), ['panel_component']);
});

test('a hepatic panel inside a full CMP is not suggested on top of 80053', () => {
  const cmp = ['82040', '82247', '82310', '82374', '82435', '82565', '82947', '84075', '84132', '84155', '84295', '84450', '84460', '84520'];
  const r = checkLabs([claim('C', ['80053'])]);
  assert.deepEqual(checks(r, 'C'), []);
  const sep = checkLabs([claim('S', cmp)]);
  assert.deepEqual(sep.items[0].issues.map((i) => i.code), ['80053']);
});

test('a waived test needs QW unless exempt, and a waiver lab may bill only waived tests', () => {
  const config = { waived_codes: ['82947', '87880', '81002'], qw_exempt: ['81002'], certificate: 'waiver' };
  const r = checkLabs([claim('W', ['82947', '87880-QW', '81002', '85025'])], [], { config });
  const msgs = r.items[0].issues.map((i) => `${i.check}:${i.code ?? ''}`);
  assert.deepEqual(msgs, ['qw:82947', 'certificate:']);
  assert.match(r.items[0].issues[1].message, /85025 is not on your waived list/);
});

test('CLIA shape: two digits, D, seven digits; a lab claim with none is an error', () => {
  const r = checkLabs([claim('A', ['85025'], { clia: '' }), claim('B', ['85025'], { clia: '36-D0999999', member: 'M2' }), claim('C', ['85025'], { clia: '36d0999999', member: 'M3' })]);
  assert.deepEqual([checks(r, 'A'), checks(r, 'B'), checks(r, 'C')], [['clia'], ['clia'], []]);
});

test('frequency counts history with compact dates and earlier claims in the file', () => {
  const config = { frequency: [{ code: '83036', months: 3, max: 1, note: 'example rule' }] };
  const r = checkLabs([claim('F', ['83036'], { date: '2026-02-10' })], [{ member_id: 'M1', date_of_service: '20260105', code: '83036' }], { config });
  assert.deepEqual(checks(r, 'F'), ['frequency']);
  assert.match(r.items[0].issues[0].message, /also done on 2026-01-05: your rule is 1 per 3 months \(example rule\)/);
  const old = checkLabs([claim('G', ['83036'])], [{ member_id: 'M1', date_of_service: '2025-10-01', code: '83036' }], { config });
  assert.deepEqual(checks(old, 'G'), []);
});

test('a diagnosis rule for one payer warns only for that payer; a rule with no prefixes is ignored', () => {
  const config = { dx_rules: [{ code: '83036', dx_prefixes: ['E08', 'E11', 'R73'], payer: 'Example Health Plan' }, { code: '85025' }] };
  const r = checkLabs([claim('X', ['83036', '85025'], { dx: ['Z00.00'] }), claim('Y', ['83036'], { dx: ['Z00.00'], payer: 'Sample Mutual', member: 'M2' }), claim('Z', ['83036'], { dx: ['R73.03'], member: 'M3' })], [], { config });
  assert.deepEqual([checks(r, 'X'), checks(r, 'Y'), checks(r, 'Z')], [['diagnosis'], [], []]);
  assert.match(r.items.find((i) => i.claim_id === 'X').issues[0].message, /Z00\.00/);
});
