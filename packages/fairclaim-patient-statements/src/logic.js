// Fairclaim Patient Statements logic: the patient statement cycle (stages and holds). No I/O.
import { str, num, round2, isoDate, daysBetween } from 'fairclaim-core';

const yes = (v) => /^(y|yes|true|1|x|active)$/i.test(str(v));
export const STAGES = ['first_statement', 'second_statement', 'final_notice'];
export const HOLDS = Object.freeze({
  legal_hold: 'Estate, bankruptcy or attorney on file: stop statements and route to the manager.',
  dispute_hold: 'The patient disputes the bill: answer the dispute before another statement.',
  hardship_review: 'Hardship noted: offer your financial assistance policy before another statement.',
  workers_comp: 'Workers compensation case: bill the carrier, not the patient. Many states do not allow billing the injured worker for a covered work injury.',
  insurance_pending: 'Part of the balance still sits with insurance: wait for the payer before billing the patient.',
  on_payment_plan: 'On a payment plan: the plan sends its own reminders.',
  bad_address: 'Mail came back or the address is marked bad: fix it before printing.',
  small_balance: 'Below your minimum statement balance.',
  recent_payment: 'Paid recently: skip this cycle.',
  not_due: 'A statement went out within the cycle.',
});

/**
 * rows: PATIENT_AR_FIELDS rows. config: { min_balance, cycle_days, recent_payment_days, collections_days, stages }.
 * facts: accepted hold_word facts ({ word, hold, note }). Returns { accounts, by_action, to_send, items }.
 */
export function statementCycle(rows, { config = {}, facts = [], asOf } = {}) {
  const min = Number.isFinite(config.min_balance) ? config.min_balance : 5;
  const cycle = Number.isFinite(config.cycle_days) ? config.cycle_days : 28;
  const recent = Number.isFinite(config.recent_payment_days) ? config.recent_payment_days : 14;
  const toColl = Number.isFinite(config.collections_days) ? config.collections_days : 30;
  const words = [
    { re: /deceased|estate|probate|bankrupt|chapter (7|13)|attorney|lawyer/i, hold: 'legal_hold', source: 'built_in' },
    { re: /disput|complain/i, hold: 'dispute_hold', source: 'built_in' },
    { re: /hardship|financial assistance|charity/i, hold: 'hardship_review', source: 'built_in' },
    { re: /\bwork(?:er|ers|ers'|man|men|man's|men's)?\s*comp\b|\bworkers'?\s*compensation\b|\bwork(?:place)?[- ]related injury\b|\bon[- ]the[- ]job injury\b/i, hold: 'workers_comp', source: 'built_in' },
    ...facts.map((f) => ({ re: new RegExp(f.value.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), hold: f.value.hold, note: f.value.note, source: 'memory', fact_id: f.id })),
  ];
  const items = [];
  for (const r of rows) {
    const balance = num(r.balance); if (!(balance > 0)) continue;
    const sent = Math.max(0, Math.floor(num(r.statements_sent) ?? 0)); const last = isoDate(r.last_statement); const paid = isoDate(r.last_payment);
    const flags = [str(r.flags), str(r.notes)].filter(Boolean).join(' ');
    const it = { account: str(r.account) || null, patient_name: str(r.patient_name) || null, balance: round2(balance), insurance_pending: round2(num(r.insurance_pending) || 0), statements_sent: sent, last_statement: last, last_payment: paid, oldest_service: isoDate(r.oldest_service), action: null, hold: null, message: '' };
    const holdBy = words.find((w) => w.re.test(flags));
    const since = (d) => (d && asOf ? daysBetween(d, asOf) : null);
    if (holdBy) Object.assign(it, { action: 'hold', hold: holdBy.hold, message: holdBy.note ? `${HOLDS[holdBy.hold]} (${holdBy.note})` : HOLDS[holdBy.hold], ...(holdBy.fact_id ? { fact_id: holdBy.fact_id } : {}) });
    else if (it.insurance_pending > 0) Object.assign(it, { action: 'hold', hold: 'insurance_pending', message: `${it.insurance_pending} is still with insurance. ${HOLDS.insurance_pending}` });
    else if (yes(r.on_plan)) Object.assign(it, { action: 'hold', hold: 'on_payment_plan', message: HOLDS.on_payment_plan });
    else if (/bad|returned|undeliverable|invalid/i.test(str(r.address_status))) Object.assign(it, { action: 'hold', hold: 'bad_address', message: HOLDS.bad_address });
    else if (balance < min) Object.assign(it, { action: 'hold', hold: 'small_balance', message: `Balance under your minimum of ${min}.` });
    else if (since(paid) !== null && since(paid) <= recent) Object.assign(it, { action: 'hold', hold: 'recent_payment', message: `Paid ${since(paid)} day(s) ago. ${HOLDS.recent_payment}` });
    else if (since(last) !== null && since(last) < cycle) Object.assign(it, { action: 'hold', hold: 'not_due', message: `Last statement ${since(last)} day(s) ago; next after ${cycle}.` });
    else if (sent >= STAGES.length) {
      const after = since(last);
      Object.assign(it, after !== null && after >= toColl ? { action: 'collections_review', message: `Final notice sent ${after} day(s) ago with no payment. A person decides: check financial assistance first, then your collections policy and current credit-reporting rules.` } : { action: 'hold', hold: 'not_due', message: `Final notice sent ${after ?? '?'} day(s) ago; review after ${toColl}.` });
    } else Object.assign(it, { action: STAGES[sent], message: sent === 2 ? 'Final notice: say plainly what happens next and how to ask for help.' : `Statement ${sent + 1}.` });
    items.push(it);
  }
  const order = { final_notice: 0, collections_review: 1, second_statement: 2, first_statement: 3, hold: 4 };
  items.sort((a, b) => order[a.action] - order[b.action] || b.balance - a.balance);
  const by = items.reduce((m, i) => { const k = i.action === 'hold' ? `hold:${i.hold}` : i.action; m[k] = (m[k] || 0) + 1; return m; }, {});
  const send = items.filter((i) => STAGES.includes(i.action));
  return { accounts: items.length, to_send: send.length, to_send_balance: round2(send.reduce((s, i) => s + i.balance, 0)), held: items.filter((i) => i.action === 'hold').length, collections_review: items.filter((i) => i.action === 'collections_review').length, by_action: by, items };
}
