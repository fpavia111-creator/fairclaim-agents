import { defineManifest, MODEL_PIN, refusedTools, memoryTools, reportTool, draftPair, findItem, page, sectionTitle, LIMITS, today } from 'remedy-core';
import { readFileSync } from 'node:fs';
import { reviewCredits } from './logic.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const OUT = 'remedy-out/tansy';

export const CREDIT_FIELDS = Object.freeze({
  account: { aliases: ['Account', 'Account Number', 'Acct #', 'Patient Account', 'Guarantor Account', 'Account No'], required: true, phi: 'account', translate: false },
  patient_name: { aliases: ['Patient', 'Patient Name', 'Guarantor', 'Guarantor Name'], phi: 'name' },
  claim_id: { aliases: ['Claim #', 'Claim ID', 'Claim Number', 'Encounter', 'Visit ID'], translate: false },
  payer: { aliases: ['Payer', 'Insurance', 'Carrier', 'Plan', 'Payer Name'] },
  payment_source: { aliases: ['Payment Source', 'Source', 'Paid By', 'Payment Type', 'Payment Method', 'From'] },
  responsible: { aliases: ['Responsible Party', 'Responsibility', 'Credit Type', 'Type'], translate: false },
  date_of_service: { aliases: ['DOS', 'Date of Service', 'Service Date'], type: 'date' },
  amount: { aliases: ['Credit', 'Credit Amount', 'Credit Balance', 'Amount', 'Overpayment', 'Balance', 'Unapplied'], type: 'money', required: true },
  credit_date: { aliases: ['Credit Date', 'Date', 'Payment Date', 'Posted Date', 'Date Created'], type: 'date', translate: false },
  identified_date: { aliases: ['Identified', 'Identified Date', 'Date Identified', 'Found On'], type: 'date', translate: false },
  open_debit: { aliases: ['Open Debit', 'Other Balance', 'Account Balance Due', 'Amount Due Elsewhere', 'Open Balance'], type: 'money', translate: false },
  reason: { aliases: ['Reason', 'Note', 'Cause', 'Comment'] },
});

const CREDIT_CONFIG_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    payers: { type: 'array', maxItems: 500, items: { type: 'object', additionalProperties: false, required: ['name'], properties: { name: { type: 'string', minLength: 1 }, refund_days: { type: 'integer', minimum: 1, maximum: 730 }, medicare: { type: 'boolean' } } } },
    default_refund_days: { type: 'integer', minimum: 1, maximum: 730, description: 'Refund deadline for payers not listed' },
    warn_days: { type: 'integer', minimum: 0, maximum: 180, description: 'Mark refunds due within this many days as refund_now (default 14)' },
    small_credit: { type: 'number', minimum: 0, maximum: 1000, description: 'Patient credits below this follow your small-credit policy' },
    escheat_days: { type: 'integer', minimum: 180, maximum: 3650, description: 'Days after which your state treats an unclaimed credit as unclaimed property (check your state)' },
    practice_name: { type: 'string', minLength: 1 },
  },
};

export const MEMORY_KINDS = Object.freeze({
  payer_refund_rule: {
    description: 'A payer\'s refund deadline from a contract or provider manual, e.g. {"payer": "Example Health Plan", "refund_days": 45, "note": "Provider manual section 9"}.',
    effect: 'uses this deadline when it is shorter than the config\'s or the Medicare default. Memory can only bring a deadline closer.',
    schema: { type: 'object', additionalProperties: false, required: ['payer', 'refund_days'], properties: { payer: { type: 'string', minLength: 1, maxLength: 120 }, refund_days: { type: 'integer', minimum: 1, maximum: 730 }, note: { type: 'string', maxLength: 300 } } },
  },
});
const MEMORY = memoryTools('tansy', MEMORY_KINDS);

const files = {
  credits: { type: 'string', description: 'Credit balance report under --root (CSV, Excel, JSON): account, patient, payer or payment source, credit amount and date, date identified, other open balance' },
  config: { type: 'string', description: 'Optional credit_config JSON: refund days per payer, default, warning days, small-credit level, unclaimed-property age' },
  as_of: { type: 'string', format: 'date', description: 'Date to count from (YYYY-MM-DD, default today)' },
};
const run = (a, ctx) => {
  const config = a.config ? ctx.readJson(a.config, 'credit_config') : {};
  return { config, out: reviewCredits(ctx.records(a.credits, 'credits'), { config, facts: ctx.memoryFacts('payer_refund_rule'), asOf: a.as_of || today() }) };
};
const sumLine = (o) => `${o.credits} credit(s) totalling ${o.total}: patient ${o.patient_total}, payer ${o.payer_total}. ${Object.entries(o.by_action).map(([k, v]) => `${k} ${v}`).join(', ')}.${o.overdue_total ? ` ${o.overdue_total} is past a refund deadline.` : ''}`;
const pair = draftPair({
  prefix: 'tansy', noun: 'refund', verb: 'refund', category: 'move_money', outDir: OUT, actor: 'your billing manager',
  title: 'Draft a refund',
  description: 'Write a draft refund for one credit: who it goes to, the amount, the claim and service date, why, and what a person must check first. Marked DRAFT; no money moves.',
  args: { ...files, account: { type: 'string' }, claim_id: { type: 'string' } }, required: ['credits', 'account'],
  build: (a, ctx) => {
    const { out, config } = run(a, ctx);
    let it = findItem(out.items, 'account', a.account, ctx, { kind: 'account', label: 'account with a credit' });
    if (a.claim_id) it = out.items.find((x) => x.account === it.account && x.claim_id === a.claim_id) || it;
    const toPayer = it.kind === 'payer_overpayment';
    return { id: `${it.account}${it.claim_id ? `-${it.claim_id}` : ''}`, to: it.refund_to, amount: it.amount, text: `**To:** ${toPayer ? `${it.refund_to} refunds [TO CONFIRM: refund address or the payer's offset instructions]` : `${it.patient_name || '[MISSING: patient]'} [TO CONFIRM: mailing address, or refund to the card used]`}\n**From:** ${config.practice_name || '[MISSING: practice name]'}\n**Refund:** ${it.amount}\n${it.refund_deadline ? `**Refund by:** ${it.refund_deadline} (${it.rule_source === 'medicare_rule' ? '60 days from identification' : `${it.rule_source} rule`})\n` : ''}\nAccount ${it.account}${it.claim_id ? `, claim ${it.claim_id}` : ''}. Credit dated ${it.credit_date || '[MISSING: credit date]'}${it.reason ? `: ${it.reason}` : ''}.\n\n${it.message}\n\nBefore this is paid:\n\n- [CHECK: the credit is real: no unposted payment, adjustment or pending appeal on the account]\n${it.open_debit ? `- [CHECK: apply ${Math.min(it.open_debit, it.amount)} to the open balance first if policy allows]\n` : ''}${toPayer ? '- [CHECK: whether the payer wants a check or an offset on a future remittance]\n' : ''}` };
  },
});
const refused = refusedTools([
  { name: 'refund_issue', category: 'move_money', description: 'Tansy never issues refunds or moves money; a person pays the approved refund.' },
  { name: 'credit_adjust', category: 'move_money', description: 'Tansy never posts adjustments or moves a credit between accounts.' },
]);

export const manifest = defineManifest({
  name: 'tansy-of-credits', version: pkg.version,
  description: 'Works the credit balance report: tells patient credits from payer overpayments, counts days against each payer\'s refund deadline (60 days from identification for Medicare by default), finds credits that should go to an open balance first or are nearing unclaimed-property age, and drafts each refund for a person to approve. Patient identifiers are masked before results reach the model.',
  model: MODEL_PIN,
  caps: { maxSteps: 60, maxSpendUsd: 0 },
  configSchemas: { credit_config: CREDIT_CONFIG_SCHEMA },
  memory: { prefix: 'tansy', kinds: MEMORY_KINDS },
  sources: { credits: { label: 'Credit balances', args: ['credits'], fields: CREDIT_FIELDS } },
  argDocs: { account: 'Account number from tansy_review (the ACCT- pseudonym works too)', claim_id: 'Claim number when the account has more than one credit', limit: 'Most credits to return (the report file always has all of them)', action: 'Only credits with this action' },
  prompts: [{
    name: 'credit_balances', title: 'Work the credit balance report',
    description: 'Walks the host model through credit balances and refunds with Tansy.',
    arguments: [{ name: 'credits', description: 'credit balance report', required: true }],
    text: `You are helping a billing manager with tansy-of-credits. Credits: {{credits}}.

Rules: Tansy never issues refunds or moves money; refund_issue is blocked. A refund needs one named person's click even in Auto. Not legal advice: refund deadlines and unclaimed-property rules depend on the payer, the contract and the state.

1. Call tansy_review. List refund_overdue and refund_now first with the deadlines.
2. For apply_to_balance, say the policy and the patient decide.
3. Offer tansy_draft_refund for one credit; the billing manager approves it (tansy_request_refund) and pays it.
4. Call tansy_write_report for the full list.`,
  }],
  tools: [
    { name: 'tansy_review', kind: 'read', title: 'Review credit balances',
      description: 'Every credit with who it belongs to, the refund deadline and days left, and an action: refund_overdue, refund_now, escheat_risk, apply_to_balance, refund, small_credit.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['credits'], properties: { ...files, action: { type: 'string', enum: ['refund_overdue', 'refund_now', 'escheat_risk', 'apply_to_balance', 'refund', 'small_credit'] }, limit: { type: 'integer', minimum: 1, maximum: 5000 } } },
      handler: async (a, ctx) => { const { out } = run(a, ctx); const { items, ...t } = out; return { summary: sumLine(out), ...t, ...page(a.action ? items.filter((i) => i.action === a.action) : items, a.limit || 200) }; } },
    ...pair.tools,
    reportTool({
      name: 'tansy_write_report', title: 'Write the credit balance work list', outDir: OUT, base: 'tansy-credits',
      description: 'Write tansy-credits.csv (one row per credit with blank owner, decision and check number columns) and tansy-credits.html into out_dir (default remedy-out/tansy).',
      properties: files, required: ['credits'],
      build: (a, ctx) => {
        const { out } = run(a, ctx);
        const rows = out.items.map((i) => ({ action: i.action, account: i.account, patient_name: i.patient_name, claim_id: i.claim_id || '', refund_to: i.refund_to, amount: i.amount, credit_date: i.credit_date || '', refund_deadline: i.refund_deadline || '', days_left: i.days_left ?? '', message: i.message, owner: '', decision: '', check_number: '' }));
        return {
          title: { en: 'Credit balance work list', de: 'Arbeitsliste Guthaben und Erstattungen', fr: 'Liste de travail des soldes créditeurs', es: 'Lista de trabajo de saldos a favor', pt: 'Lista de trabalho de saldos credores', it: 'Elenco di lavoro dei saldi a credito', ja: '過払い残高作業リスト', zh: '贷方余额工作清单', ko: '대변 잔액 작업 목록' },
          intro: sumLine(out), rows, summary: `Credit work list written: ${sumLine(out)}`,
          htmlColumns: ['action', 'account', 'refund_to', 'amount', 'credit_date', 'refund_deadline', 'days_left', 'message'],
          sections: [{ title: sectionTitle('by_status'), rows: Object.entries(out.by_action).map(([k, v]) => ({ action: k, count: v })), columns: ['action', 'count'] }],
          limits: [LIMITS.files, 'Refund deadlines are the ones in your config and memory plus the Medicare 60-day default; contracts, state law and unclaimed-property rules differ. Not legal advice.', LIMITS.phi, LIMITS.advice],
        };
      },
    }),
    ...MEMORY.tools,
    ...refused.tools,
  ],
  policy: { rules: [
    { tool: 'tansy_review', decision: 'allow' },
    { tool: 'tansy_write_report', decision: 'allow' },
    ...pair.rules,
    ...MEMORY.rules,
    ...refused.rules,
    { tool: '*', decision: 'block', reason: 'Not on the Tansy allowlist.' },
  ] },
});
