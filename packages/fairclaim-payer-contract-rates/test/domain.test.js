// Domain checks for payer rates against Medicare and the contract calendar (ver 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareRates, contractCalendar } from '../src/logic.js';

const medicare = [{ code: '99213', amount: 100 }, { code: '71046', amount: 40 }, { code: '71046', modifier: '26', amount: 10 }];
const volumes = [{ code: '99213', volume: 1000 }, { code: '71046', volume: 50 }, { code: '71046', modifier: '26', volume: 50 }];

test('percent of Medicare per line, and the gap to the floor is multiplied by the volume', () => {
  const r = compareRates([{ payer: 'Example Health Plan', code: '99213', allowed: 105 }], { medicare, volumes, config: { floor_percent: 110 } });
  assert.deepEqual([r.lines[0].percent_of_medicare, r.lines[0].below_floor, r.lines[0].gap_to_floor], [105, true, 5000]);
  assert.equal(r.gap_to_floor, 5000);
});

test('a professional component rate is compared with the 26 amount, and with nothing when there is none', () => {
  const r = compareRates([{ payer: 'P', code: '71046', modifier: '26', allowed: 12 }, { payer: 'P', code: '71046', modifier: 'TC', allowed: 30 }], { medicare, volumes });
  const by = Object.fromEntries(r.lines.map((l) => [l.modifier, l]));
  assert.deepEqual([by['26'].medicare, by['26'].percent_of_medicare], [10, 120]);
  assert.equal(by.TC.medicare, null);
  assert.deepEqual(r.no_medicare, ['71046']);
});

test('a payer floor from the config beats a lower general floor; a floor for another payer does not apply', () => {
  const config = { floor_percent: 100, payers: [{ name: 'example health plan', floor_percent: 125 }] };
  const r = compareRates([{ payer: 'Example Health Plan', code: '99213', allowed: 120 }, { payer: 'Sample Mutual', code: '99213', allowed: 120 }], { medicare, volumes, config });
  const by = Object.fromEntries(r.lines.map((l) => [l.payer, l]));
  assert.deepEqual([by['Example Health Plan'].floor_percent, by['Example Health Plan'].below_floor], [125, true]);
  assert.deepEqual([by['Sample Mutual'].floor_percent, by['Sample Mutual'].below_floor], [100, false]);
});

test('the code table shows the best and worst payer and the spread, largest spread at volume first', () => {
  const r = compareRates([{ payer: 'A', code: '99213', allowed: 130 }, { payer: 'B', code: '99213', allowed: 95 }, { payer: 'A', code: '71046', allowed: 60 }, { payer: 'B', code: '71046', allowed: 30 }], { medicare, volumes });
  assert.deepEqual(r.codes.map((c) => [c.code, c.best_payer, c.worst_payer, c.spread]), [['99213', 'A', 'B', 35], ['71046', 'A', 'B', 30]]);
});

test('rows with no payer, code or amount are skipped; a payer with no volume has no weighted percent', () => {
  const r = compareRates([{ payer: '', code: '99213', allowed: 1 }, { payer: 'A', code: '', allowed: 1 }, { payer: 'A', code: '99213', allowed: '' }, { payer: 'A', code: '99999', allowed: 10 }], { medicare, volumes });
  assert.equal(r.lines.length, 1);
  assert.equal(r.payers[0].percent_of_medicare, null);
});

test('calendar: notice window, a long-ended auto-renewing contract, expired, no end date, in that order', () => {
  const rows = contractCalendar([
    { payer: 'Quiet', end_date: '2028-01-01', notice_days: 90, auto_renew: 'Yes' },
    { payer: 'Auto old', end_date: '2025-06-30', notice_days: 90, auto_renew: 'yes' },
    { payer: 'Window', end_date: '2026-06-30', notice_days: 90, auto_renew: 'No' },
    { payer: 'Gone', end_date: '2026-01-31', notice_days: 60, auto_renew: '' },
    { payer: 'Blank' },
  ], { asOf: '2026-02-15', warnDays: 120 });
  assert.deepEqual(rows.map((r) => [r.payer, r.status]), [['Window', 'notice_window'], ['Gone', 'expired'], ['Auto old', 'renews_automatically'], ['Blank', 'no_end_date'], ['Quiet', 'active']]);
  assert.match(rows[2].next_step, /renewed by itself on the same terms: record the new end date/);
  assert.equal(rows[0].notice_deadline, '2026-04-01');
});
