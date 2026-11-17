import { defineManifest, MODEL_PIN, REMIT_FIELDS, DEPOSIT_FIELDS, readRemits, refusedTools, memoryTools, reportTool, draftPair, page, sectionTitle, LIMITS, str } from 'remedy-core';
import { readFileSync } from 'node:fs';
import { matchPayments, explainPlb } from './logic.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const OUT = 'remedy-out/fennel';

const REMIT_CONFIG_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    date_window_days: { type: 'integer', minimum: 0, maximum: 60, description: 'Days either side of the payment date to look for a deposit of the same amount (default 5)' },
    ignore_descriptions: { type: 'array', maxItems: 200, items: { type: 'string', minLength: 2, maxLength: 80 }, description: 'Deposit descriptions that are never insurance money (card settlements, transfers)' },
    practice_name: { type: 'string', maxLength: 120 },
  },
};

export const MEMORY_KINDS = Object.freeze({
  payer_deposit_name: {
    description: 'How one payer\'s deposits read on the bank statement, e.g. {"payer": "Example Health Plan", "bank_text": "EXMPL HLTH HCCLAIMPMT"}.',
    effect: 'labels a deposit that has no remittance with the payer it likely came from, so the inquiry goes to the right place. It never matches a deposit to a payment.',
    schema: { type: 'object', additionalProperties: false, required: ['payer', 'bank_text'], properties: { payer: { type: 'string', minLength: 1, maxLength: 120 }, bank_text: { type: 'string', minLength: 4, maxLength: 80 } } },
  },
});
const MEMORY = memoryTools('fennel', MEMORY_KINDS);

const files = {
  remits: { type: 'string', description: 'Remittances under --root: an X12 835 file or a payment/ERA export with check or trace number, payer, date and paid amount' },
  deposits: { type: 'string', description: 'Bank deposits under --root: a bank export (CSV, Excel, JSON) with date, amount and description; trace numbers are read from a trace column or from TRN*1* in the description' },
  config: { type: 'string', description: 'Optional remit_config JSON: date window, descriptions to ignore, practice name for letters' },
};
const run = (a, ctx) => {
  const config = a.config ? ctx.readJson(a.config, 'remit_config') : {};
  const r = readRemits(ctx, a.remits);
  const deposits = ctx.records(a.deposits, 'deposits');
  const aliases = ctx.memoryFacts('payer_deposit_name').map((f) => ({ ...f.value, id: f.id }));
  return { r, config, out: matchPayments(r.payments, deposits, { windowDays: config.date_window_days ?? 5, aliases, ignore: config.ignore_descriptions || [] }), plb: explainPlb(r.plb || []) };
};
const sumLine = (o) => `${o.payments} payment(s) totalling ${o.era_total}: ${o.matched} matched to deposits (${o.deposited_and_matched}), ${o.by_status.no_deposit || 0} with no deposit (${o.no_deposit_total}), ${o.by_status.amount_mismatch || 0} amount mismatch(es) (${o.mismatch_total}). ${o.deposits_without_era} deposit(s) without a remittance (${o.deposits_without_era_total}).`;

const pair = draftPair({
  prefix: 'fennel', noun: 'inquiry', verb: 'send', category: 'binding_send', outDir: OUT, actor: 'your billing lead',
  title: 'Draft a payer inquiry',
  description: 'Write a draft letter to a payer about one remittance with no deposit (pass its trace number) or one deposit with no remittance (pass its deposit id). Marked DRAFT; nothing is sent. The draft file names the payer and amounts; open markers show what a person must fill.',
  args: { ...files, item: { type: 'string', description: 'Trace number of a payment, or deposit id of an unmatched deposit, from fennel_match' } },
  required: ['remits', 'deposits', 'item'],
  build: (a, ctx) => {
    const { out, config } = run(a, ctx);
    const want = str(a.item).toUpperCase();
    const p = out.rows.find((x) => str(x.trace_number).toUpperCase() === want);
    const d = out.unmatched_deposits.find((x) => str(x.deposit_id).toUpperCase() === want);
    if (!p && !d) throw new Error(`item ${a.item} is neither a payment trace number nor an unmatched deposit id from fennel_match`);
    const practice = config.practice_name || '[MISSING: practice name]';
    if (p) {
      if (!['no_deposit', 'amount_mismatch'].includes(p.status)) throw new Error(`payment ${p.trace_number} is ${p.status}; an inquiry is for no_deposit or amount_mismatch`);
      return { id: p.trace_number, to: p.payer, amount: p.era_amount, text: `**To:** ${p.payer}\n**From:** ${practice}\n**Subject:** Payment ${p.trace_number} dated ${p.payment_date}\n\nYour remittance advice ${p.trace_number} dated ${p.payment_date} reports a payment of ${p.era_amount}${p.method ? ` by ${p.method}` : ''}.\n\n${p.status === 'no_deposit' ? 'We cannot find this payment in our bank account.' : `Our bank received ${p.deposit_amount} on ${p.deposit_date}, a difference of ${p.difference}.`} Please confirm the payment status, the account it was sent to, and any offset taken.\n\nOur payee NPI and account details: [MISSING: payee NPI], account ending [MISSING: last 4 digits].\n\nContact: [MISSING: name and phone]\n` };
    }
    return { id: d.deposit_id, to: d.likely_payer || '[TO CONFIRM: payer]', amount: d.amount, text: `**To:** ${d.likely_payer || '[TO CONFIRM: payer]'}\n**From:** ${practice}\n**Subject:** Remittance advice for deposit of ${d.amount} on ${d.date}\n\nWe received a deposit of ${d.amount} on ${d.date}${d.trace_numbers.length ? ` with trace number ${d.trace_numbers.join(', ')}` : ''} and have no remittance advice (835) for it.\n\nPlease send the 835 or a detailed remittance so we can post the payment to the right claims. If the 835 went to a clearinghouse, tell us which.\n\nOur payee NPI: [MISSING: payee NPI]. Contact: [MISSING: name and phone]\n` };
  },
});
const refused = refusedTools([
  { name: 'payment_post', category: 'move_money', description: 'Fennel never posts payments in the practice-management system; your payment poster does.' },
  { name: 'bank_transfer', category: 'move_money', description: 'Fennel never moves money.' },
]);

export const manifest = defineManifest({
  name: 'fennel-of-remits', version: pkg.version,
  description: 'Matches 835 remittances (or ERA exports) to bank deposits: by trace number first, then exact amount and date. Lists payments with no deposit, deposits with no remittance, amount differences and provider-level adjustments (recoveries, interest, levies) with how to post them, and drafts the payer inquiry for a person to send.',
  model: MODEL_PIN,
  caps: { maxSteps: 60, maxSpendUsd: 0 },
  configSchemas: { remit_config: REMIT_CONFIG_SCHEMA },
  memory: { prefix: 'fennel', kinds: MEMORY_KINDS },
  sources: { remits: { label: 'Remittances (ERA / payment export)', args: ['remits'], fields: REMIT_FIELDS }, deposits: { label: 'Bank deposits', args: ['deposits'], fields: DEPOSIT_FIELDS } },
  argDocs: { limit: 'Most payments to return (the report file always has all of them)' },
  prompts: [{
    name: 'reconcile_remits', title: 'Reconcile remittances with the bank',
    description: 'Walks the host model through matching ERAs to deposits with Fennel.',
    arguments: [{ name: 'remits', description: '835 file or ERA export under --root', required: true }, { name: 'deposits', description: 'Bank export under --root', required: true }],
    text: `You are helping a payment poster reconcile remittances with the bank using fennel-of-remits. Remittances: {{remits}}. Deposits: {{deposits}}.

Rules: Fennel never posts payments or moves money; payment_post and bank_transfer are blocked. A drafted inquiry is sent by a person after fennel_request_send (one named click).

1. Call fennel_match. Report matched totals, payments with no deposit, amount mismatches and deposits without a remittance.
2. Call fennel_plb and say how each provider-level adjustment should be posted.
3. For each problem item, offer fennel_draft_inquiry; show the draft path and its open markers.
4. If a deposit's description names a payer Fennel did not recognise, offer fennel_learn with kind payer_deposit_name.
5. Call fennel_write_report for the reconciliation file.`,
  }],
  tools: [
    { name: 'fennel_match', kind: 'read', title: 'Match remittances to deposits',
      description: 'Match each remittance payment to a bank deposit (trace number, then exact amount within the date window) and list the unmatched on both sides with what to do. Also returns the 835 balancing problems.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['remits', 'deposits'], properties: { ...files, limit: { type: 'integer', minimum: 1, maximum: 5000 } } },
      handler: async (a, ctx) => { const { r, out, plb } = run(a, ctx); const { rows, ...t } = out; return { summary: sumLine(out), source: r.source, ...(r.x12 ? { x12_problems: r.x12.problems.slice(0, 20) } : {}), ...t, provider_adjustments: { reduced: plb.reduced, added: plb.added }, ...page(rows, a.limit || 200) }; } },
    { name: 'fennel_plb', kind: 'read', title: 'Explain provider-level adjustments',
      description: 'List the PLB (provider-level) adjustments in the 835s: reason, meaning, reference, whether it reduced or added to the payment, and how to post it.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['remits'], properties: { remits: files.remits } },
      handler: async (a, ctx) => { const r = readRemits(ctx, a.remits); const p = explainPlb(r.plb || []); return { summary: `${p.items.length} provider-level adjustment(s): ${p.reduced} taken from payments, ${p.added} added.`, ...p }; } },
    reportTool({
      name: 'fennel_write_report', title: 'Write the reconciliation', outDir: OUT, base: 'fennel-reconciliation',
      description: 'Write fennel-reconciliation.csv (one row per payment and per unmatched deposit, with blank owner and notes columns) and fennel-reconciliation.html into out_dir (default remedy-out/fennel).',
      properties: files, required: ['remits', 'deposits'],
      build: (a, ctx) => {
        const { out, plb } = run(a, ctx);
        const rows = [
          ...out.rows.map((x) => ({ status: x.status, payer: x.payer, trace_number: x.trace_number, payment_date: x.payment_date, amount: x.era_amount, deposit: x.deposit_id || '', date: x.deposit_date || '', matched: x.deposit_amount ?? '', difference: x.difference, notes: x.note, owner: '', decision: '' })),
          ...out.unmatched_deposits.map((d) => ({ status: d.status, payer: d.likely_payer || '', trace_number: d.trace_numbers.join(' '), payment_date: '', amount: '', deposit: d.deposit_id, date: d.date, matched: d.amount, difference: d.amount, notes: d.note, owner: '', decision: '' })),
        ];
        return {
          title: { en: 'Remittance and deposit reconciliation', de: 'Abgleich Zahlungsavis und Bankeingänge', fr: 'Rapprochement des avis de paiement et des dépôts', es: 'Conciliación de remesas y depósitos', pt: 'Conciliação de demonstrativos e depósitos', it: 'Riconciliazione rimesse e versamenti', ja: '支払明細と入金の照合', zh: '汇款通知与银行入账核对', ko: '지급 내역과 입금 대사' },
          intro: sumLine(out), rows, summary: `Reconciliation written: ${sumLine(out)}`,
          htmlColumns: ['status', 'payer', 'trace_number', 'payment_date', 'amount', 'deposit', 'date', 'matched', 'difference', 'notes'],
          sections: [
            { title: sectionTitle('by_status'), rows: Object.entries(out.by_status).map(([k, v]) => ({ status: k, count: v })), columns: ['status', 'count'] },
            { title: { en: 'Provider-level adjustments', de: 'Anpassungen auf Leistungserbringerebene', fr: 'Ajustements au niveau du prestataire', es: 'Ajustes a nivel de proveedor', pt: 'Ajustes no nível do prestador', it: 'Rettifiche a livello di erogatore', ja: '提供者レベルの調整', zh: '服务提供者层面调整', ko: '제공자 수준 조정' }, rows: plb.items.map((x) => ({ reason: x.reason, notes: x.meaning, trace_number: x.trace_number, amount: x.amount, next_step: x.next_step })), columns: ['reason', 'notes', 'trace_number', 'amount', 'next_step'] },
          ],
          limits: [LIMITS.files, 'Matching uses trace numbers and exact amounts. A deposit that bundles several payments, or a bank that shortens the trace, needs a person.', LIMITS.advice],
        };
      },
    }),
    ...pair.tools,
    ...MEMORY.tools,
    ...refused.tools,
  ],
  policy: { rules: [
    { tool: 'fennel_match', decision: 'allow' },
    { tool: 'fennel_plb', decision: 'allow' },
    { tool: 'fennel_write_report', decision: 'allow' },
    ...pair.rules,
    ...MEMORY.rules,
    ...refused.rules,
    { tool: '*', decision: 'block', reason: 'Not on the Fennel allowlist.' },
  ] },
});
