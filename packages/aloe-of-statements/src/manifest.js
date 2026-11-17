import { defineManifest, MODEL_PIN, refusedTools, memoryTools, reportTool, draftPair, findItem, page, sectionTitle, LIMITS, today } from 'remedy-core';
import { readFileSync } from 'node:fs';
import { statementCycle, HOLDS, STAGES } from './logic.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const OUT = 'remedy-out/aloe';

export const PATIENT_AR_FIELDS = Object.freeze({
  account: { aliases: ['Account', 'Account Number', 'Acct #', 'Guarantor Account', 'Patient Account', 'Account No'], required: true, phi: 'account', translate: false },
  patient_name: { aliases: ['Guarantor', 'Guarantor Name', 'Patient', 'Patient Name', 'Responsible Party'], phi: 'name' },
  balance: { aliases: ['Patient Balance', 'Balance', 'Amount Due', 'Pt Balance', 'Guarantor Balance', 'Self-Pay Balance'], type: 'money', required: true },
  insurance_pending: { aliases: ['Insurance Pending', 'Insurance Balance', 'Ins Balance', 'Pending Insurance'], type: 'money', translate: false },
  statements_sent: { aliases: ['Statements Sent', 'Statement Count', '# Statements', 'Dunning Level', 'Statements'], type: 'number', translate: false },
  last_statement: { aliases: ['Last Statement', 'Last Statement Date', 'Last Billed', 'Last Stmt'], type: 'date', translate: false },
  last_payment: { aliases: ['Last Payment', 'Last Payment Date', 'Last Pmt Date'], type: 'date', translate: false },
  on_plan: { aliases: ['Payment Plan', 'On Plan', 'Plan Active', 'Installment Plan'] },
  address_status: { aliases: ['Address Status', 'Bad Address', 'Mail Returned', 'Returned Mail'] },
  flags: { aliases: ['Flags', 'Account Flags', 'Alerts', 'Hold Reason', 'Status'] },
  notes: { aliases: ['Notes', 'Comments', 'Last Note'] },
  oldest_service: { aliases: ['Oldest DOS', 'Oldest Service Date', 'First DOS', 'Oldest Date of Service'], type: 'date' },
});

const STATEMENT_CONFIG_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    min_balance: { type: 'number', minimum: 0, maximum: 1000, description: 'Do not send statements below this balance (default 5)' },
    cycle_days: { type: 'integer', minimum: 7, maximum: 120, description: 'Days between statements (default 28)' },
    recent_payment_days: { type: 'integer', minimum: 0, maximum: 90, description: 'Skip accounts paid within this many days (default 14)' },
    collections_days: { type: 'integer', minimum: 1, maximum: 365, description: 'Days after the final notice before collections review (default 30)' },
    practice_name: { type: 'string', minLength: 1 },
    pay_by: { type: 'string', maxLength: 300, description: 'How to pay: portal address, phone, mail' },
    assistance_text: { type: 'string', maxLength: 600, description: 'Your financial assistance sentence, printed on every statement' },
  },
};

export const MEMORY_KINDS = Object.freeze({
  hold_word: {
    description: 'A word in account flags or notes that should stop statements, e.g. {"word": "workers comp", "hold": "insurance_pending", "note": "Bill the employer\'s carrier, not the patient"}.',
    effect: 'holds statements for accounts whose flags or notes contain the word. It only adds holds; it never sends a statement the built-in holds would stop.',
    schema: { type: 'object', additionalProperties: false, required: ['word', 'hold'], properties: { word: { type: 'string', minLength: 3, maxLength: 60 }, hold: { type: 'string', enum: Object.keys(HOLDS) }, note: { type: 'string', maxLength: 300 } } },
  },
});
const MEMORY = memoryTools('aloe', MEMORY_KINDS);

const files = {
  accounts: { type: 'string', description: 'Patient balances under --root (CSV, Excel, JSON): account, guarantor, patient balance, insurance still pending, statements sent, last statement and payment dates, plan, address status, flags' },
  config: { type: 'string', description: 'Optional statement_config JSON: minimum balance, cycle days, recent payment days, days to collections review, how to pay, assistance sentence' },
  as_of: { type: 'string', format: 'date', description: 'Statement run date (YYYY-MM-DD, default today)' },
};
const cfg = (a, ctx) => (a.config ? ctx.readJson(a.config, 'statement_config') : {});
const run = (a, ctx) => { const config = cfg(a, ctx); return { config, out: statementCycle(ctx.records(a.accounts, 'accounts'), { config, facts: ctx.memoryFacts('hold_word'), asOf: a.as_of || today() }) }; };
const sumLine = (o) => `${o.accounts} account(s) with a balance: ${o.to_send} statement(s) to send (${o.to_send_balance}), ${o.held} held, ${o.collections_review} for collections review. ${Object.entries(o.by_action).map(([k, v]) => `${k} ${v}`).join(', ')}.`;
const pair = draftPair({
  prefix: 'aloe', noun: 'statement', verb: 'send', category: 'binding_send', outDir: OUT, actor: 'your billing lead',
  title: 'Draft a patient statement',
  description: 'Write a plain-language statement for one account at its stage (first, second or final), with the balance, how to pay and your financial assistance sentence. Refuses held accounts. Marked DRAFT; nothing is sent.',
  args: { ...files, account: { type: 'string' } }, required: ['accounts', 'account'],
  build: (a, ctx) => {
    const { out, config } = run(a, ctx);
    const it = findItem(out.items, 'account', a.account, ctx, { kind: 'account', label: 'account with a balance' });
    if (!STAGES.includes(it.action)) throw new Error(`account ${a.account} is not due a statement (${it.action === 'hold' ? `held: ${it.hold}` : it.action}); ${it.message}`);
    const final = it.action === 'final_notice';
    return { id: String(it.account), to: it.patient_name, amount: it.balance, text: `**To:** ${it.patient_name || '[MISSING: guarantor]'} [CHECK: mailing address on file]\n**From:** ${config.practice_name || '[MISSING: practice name]'}\n**Account:** ${it.account}\n**${final ? 'Final notice' : `Statement ${STAGES.indexOf(it.action) + 1}`}**\n\nYou owe **${it.balance}** for care${it.oldest_service ? ` since ${it.oldest_service}` : ''}. Your insurance has already paid its part.\n\n${final ? 'This is our final notice. If we do not hear from you within 30 days, we will review the account under our collections policy. Please call us if you cannot pay the full amount: we can set up a payment plan.' : 'Please pay by the date below, or call us to set up a payment plan.'}\n\n**Pay by:** [TO CONFIRM: due date]\n**How to pay:** ${config.pay_by || '[MISSING: portal address, phone and mailing address]'}\n\n${config.assistance_text || '[MISSING: your financial assistance sentence]'}\n\n[ATTACH: itemized bill]\n` };
  },
});
const refused = refusedTools([
  { name: 'statement_send', category: 'binding_send', description: 'Aloe never mails, emails or texts patients; your statement vendor or a person sends approved statements.' },
  { name: 'collections_assign', category: 'binding_send', description: 'Aloe never sends accounts to a collection agency or credit bureau.' },
]);

export const manifest = defineManifest({
  name: 'aloe-of-statements', version: pkg.version,
  description: 'Plans each patient statement cycle: who gets a first, second or final statement, who is held (insurance still pending, payment plan, dispute, estate or bankruptcy, hardship, bad address, small balance, recent payment) and who reaches collections review, and drafts a plain-language statement for a person to send. Patient identifiers are masked before results reach the model.',
  model: MODEL_PIN,
  caps: { maxSteps: 60, maxSpendUsd: 0 },
  configSchemas: { statement_config: STATEMENT_CONFIG_SCHEMA },
  memory: { prefix: 'aloe', kinds: MEMORY_KINDS },
  sources: { accounts: { label: 'Patient balances', args: ['accounts'], fields: PATIENT_AR_FIELDS } },
  argDocs: { account: 'Account number from aloe_cycle (the ACCT- pseudonym works too)', limit: 'Most accounts to return (the report file always has all of them)', action: 'Only accounts with this action' },
  prompts: [{
    name: 'statement_run', title: 'Plan this statement run',
    description: 'Walks the host model through a patient statement cycle with Aloe.',
    arguments: [{ name: 'accounts', description: 'patient balances', required: true }],
    text: `You are helping a billing lead with aloe-of-statements. Accounts: {{accounts}}.

Rules: Aloe never sends statements or assigns accounts to collections. Be kind in any patient-facing words. Not legal advice: collections and credit-reporting rules change; a person checks them.

1. Call aloe_cycle. Report how many statements go out at each stage and why others are held.
2. For collections_review, say a person decides, after checking financial assistance.
3. Offer aloe_draft_statement for an account; the billing lead approves and sends it.
4. Call aloe_write_report for the run list with real names.`,
  }],
  tools: [
    { name: 'aloe_cycle', kind: 'read', title: 'Plan the statement cycle',
      description: 'Each account with a balance: the action (first_statement, second_statement, final_notice, collections_review, hold), the hold reason and the message.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['accounts'], properties: { ...files, action: { type: 'string', enum: [...STAGES, 'collections_review', 'hold'] }, limit: { type: 'integer', minimum: 1, maximum: 5000 } } },
      handler: async (a, ctx) => { const { out } = run(a, ctx); const { items, ...t } = out; return { summary: sumLine(out), ...t, ...page(a.action ? items.filter((i) => i.action === a.action) : items, a.limit || 200) }; } },
    ...pair.tools,
    reportTool({
      name: 'aloe_write_report', title: 'Write the statement run list', outDir: OUT, base: 'aloe-statements',
      description: 'Write aloe-statements.csv (one row per account with blank owner and sent columns) and aloe-statements.html into out_dir (default remedy-out/aloe).',
      properties: files, required: ['accounts'],
      build: (a, ctx) => {
        const { out } = run(a, ctx);
        const rows = out.items.map((i) => ({ action: i.action, hold: i.hold || '', account: i.account, patient_name: i.patient_name, balance: i.balance, statements_sent: i.statements_sent, last_statement: i.last_statement || '', last_payment: i.last_payment || '', message: i.message, owner: '', sent: '' }));
        return {
          title: { en: 'Patient statement run', de: 'Patientenrechnungslauf', fr: 'Envoi des relevés patients', es: 'Ciclo de estados de cuenta de pacientes', pt: 'Ciclo de extratos de pacientes', it: 'Ciclo degli estratti conto dei pazienti', ja: '患者請求書の発送一覧', zh: '患者账单周期', ko: '환자 청구서 발송 목록' },
          intro: sumLine(out), rows, summary: `Statement run list written: ${sumLine(out)}`,
          htmlColumns: ['action', 'hold', 'account', 'balance', 'statements_sent', 'last_statement', 'last_payment', 'message'],
          sections: [{ title: sectionTitle('by_status'), rows: Object.entries(out.by_action).map(([k, v]) => ({ action: k, count: v })), columns: ['action', 'count'] }],
          limits: [LIMITS.files, 'Collections and credit-reporting rules vary by state and change over time; a person checks them before any account moves.', LIMITS.phi, LIMITS.advice],
        };
      },
    }),
    ...MEMORY.tools,
    ...refused.tools,
  ],
  policy: { rules: [
    { tool: 'aloe_cycle', decision: 'allow' },
    { tool: 'aloe_write_report', decision: 'allow' },
    ...pair.rules,
    ...MEMORY.rules,
    ...refused.rules,
    { tool: '*', decision: 'block', reason: 'Not on the Aloe allowlist.' },
  ] },
});
