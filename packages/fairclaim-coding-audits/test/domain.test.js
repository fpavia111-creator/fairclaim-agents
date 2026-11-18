// Domain checks for the audit sample and audit scoring (ver 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, drawSample, scoreAudit, focusCodes, emLevel } from '../src/logic.js';

const line = (provider, billed, audited, o = {}) => ({ provider, claim_id: o.id || `${provider}-${Math.random().toString(36).slice(2, 7)}`, billed_code: billed, audited_code: audited, billed_amount: o.billed ?? 100, audited_amount: o.audited ?? (billed === audited ? 100 : 70), paid: o.paid ?? 'Y', billed_modifiers: o.bm, audited_modifiers: o.am });
const ten = (provider, fn) => Array.from({ length: 10 }, (_, i) => fn(i, provider));

test('critical care time codes are not E/M levels: 99292 for 99291 is a wrong code, not a downcode', () => {
  assert.equal(emLevel('99291'), null);
  assert.equal(classify({ billed_code: '99291', audited_code: '99292' }).outcome, 'wrong_code');
  assert.deepEqual(emLevel('99285'), { family: '9928', level: 5 });
});

test('below target: a focused review and a re-audit, naming a pattern of higher levels', () => {
  const r = scoreAudit(ten('Dr Up', (i, p) => (i < 3 ? line(p, '99215', '99213') : line(p, '99213', '99213'))), { config: { accuracy_target: 95, probe_size: 12 } });
  const p = r.providers[0];
  assert.deepEqual([p.accuracy, p.upcoded, p.action, p.pattern], [70, 3, 'focused_review', 'higher_levels']);
  assert.match(p.message, /audit 12 new lines in 30 to 90 days\. Most E\/M errors are levels higher/);
});

test('meeting the target can still point out levels lower than the notes support', () => {
  const r = scoreAudit(ten('Dr Low', (i, p) => (i < 2 ? line(p, '99212', '99213', { audited: 130 }) : line(p, '99213', '99213'))), { config: { accuracy_target: 80 } });
  const p = r.providers[0];
  assert.deepEqual([p.action, p.pattern, p.underpaid], ['meets_target', 'lower_levels', 60]);
});

test('money: a line the record does not support is a full overpayment, and only paid lines go into the refund note', () => {
  const r = scoreAudit([line('A', '20610', 'none', { billed: 150, paid: 'Y' }), line('A', '99215', '99214', { billed: 200, audited: 160, paid: 'N' })]);
  assert.deepEqual([r.overpaid, r.paid_overpayment_lines, r.paid_overpayment], [190, 1, 150]);
  assert.match(r.refund_note, /1 paid line\(s\).*generally due within 60 days.*for a person to approve/);
});

test('rows with no billed and no audited code are skipped; an empty file gives no accuracy', () => {
  assert.equal(scoreAudit([{ provider: 'A' }]).lines, 0);
  assert.equal(scoreAudit([]).accuracy, null);
});

test('focus codes from the config and memory are joined without repeats; a wildcard focus pulls every match into an E/M-only sample', () => {
  const f = focusCodes({ focus_codes: ['20610'] }, [{ id: 'f1', value: { codes: ['20610', 'J*'] } }, { id: 'f2', value: { code: '99215' } }]);
  assert.deepEqual(f, [{ code: '20610' }, { code: 'J*', fact_id: 'f1' }, { code: '99215', fact_id: 'f2' }]);
  const claims = [{ claim_id: 'C1', provider: 'A', payer_name: 'P', diagnoses: [], lines: [{ line: 1, code: '99213', modifiers: [], charge: 90, date_from: '2026-01-05' }, { line: 2, code: 'J1030', modifiers: [], charge: 20, date_from: '2026-01-05' }, { line: 3, code: '20610', modifiers: [], charge: 80, date_from: '2026-01-05' }] }];
  const s = drawSample(claims, { perProvider: 5, emOnly: true, focus: [{ code: 'j*', fact_id: 'f1' }] });
  assert.deepEqual(s.lines.map((l) => [l.code, l.reason]), [['99213', 'random'], ['J1030', 'focus']]);
  assert.equal(s.lines[1].fact_id, 'f1');
  assert.equal(s.providers[0].short, true);
});
