// Domain checks for good faith estimate timing and bills against estimates (ver 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gfeDue, checkTiming, compareBills, estimateLines } from '../src/logic.js';

const row = (o = {}) => ({ appointment_id: 'G1', patient_name: 'Pat Example', coverage: 'Self-pay', scheduled_on: '2026-03-02', service_date: '2026-03-30', ...o });
const one = (o, opts = {}) => checkTiming([row(o)], { asOf: '2026-03-03', ...opts }).items[0];

test('when both apply, the earlier of the scheduling and request deadlines wins', () => {
  // Scheduled Mon 2 Mar for 30 Mar (20 business days): due Thu 5 Mar. Requested Fri 27 Feb: due Wed 4 Mar.
  assert.deepEqual(gfeDue({ scheduled_on: '2026-03-02', service_date: '2026-03-30', requested_on: '2026-02-27' }), { due: '2026-03-04', basis: 'requested: 3 business days' });
  assert.equal(gfeDue({ scheduled_on: '2026-03-02', service_date: '2026-03-30' }).due, '2026-03-05');
});

test('a holiday in the window pushes the due date by a business day', () => {
  assert.equal(one({}, { config: { holidays: ['2026-03-04'] } }).due_on, '2026-03-06');
  assert.equal(one({}).due_on, '2026-03-05');
});

test('issued on the due date is on time; one day after is late', () => {
  assert.equal(one({ issued_on: '2026-03-05' }).status, 'ok');
  const late = one({ issued_on: '2026-03-06' });
  assert.equal(late.status, 'late'); assert.match(late.message, /after the due date 2026-03-05/);
});

test('an insured patient needs no self-pay estimate unless they ask for one', () => {
  assert.equal(one({ coverage: 'Example Health Plan' }).status, 'not_required');
  assert.equal(one({ coverage: 'Example Health Plan', requested_on: '2026-03-02' }).status, 'due');
  assert.equal(one({ coverage: 'Example Health Plan', self_pay: 'Yes' }).status, 'due');
  assert.equal(one({ coverage: '' }).status, 'due', 'blank coverage counts as self-pay');
});

test('past the due date and not issued is missing, with negative business days left', () => {
  const m = one({}, { asOf: '2026-03-09' });
  assert.equal(m.status, 'missing'); assert.equal(m.days_left, -2); assert.match(m.message, /record why it was late/);
  const r = checkTiming([row({ appointment_id: 'A' }), row({ appointment_id: 'B', issued_on: '2026-03-03' }), row({ appointment_id: 'C', scheduled_on: '2026-03-04' })], { asOf: '2026-03-09' });
  assert.deepEqual(r.items.map((i) => `${i.appointment_id}:${i.status}`), ['A:missing', 'C:due', 'B:ok']);
  assert.equal(r.need_action, 2);
});

test('bills under the estimate are within it and do not reduce the total over', () => {
  const r = compareBills([{ gfe_id: 'E1', estimate: '1000', billed: '1399.99' }, { gfe_id: 'E2', estimate: '500', billed: '450' }, { gfe_id: 'E3', estimate: '200', billed: '650' }]);
  assert.deepEqual(r.items.map((i) => `${i.gfe_id}:${i.status}`), ['E3:dispute_eligible', 'E1:over_estimate', 'E2:within']);
  assert.equal(r.over_total, 849.99);
});

test('estimate lines price known codes by units and leave unknown codes blank', () => {
  const lines = estimateLines(['99203', 'j1100', '00000'], [{ code: '99203', description: 'New patient visit', price: '150' }, { code: 'J1100', price: '12.5' }], { j1100: 4 });
  assert.deepEqual(lines.map((l) => [l.code, l.total]), [['99203', 150], ['J1100', 50], ['00000', null]]);
});
