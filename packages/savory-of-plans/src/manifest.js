import { defineManifest, MODEL_PIN, refusedTools, memoryTools, reportTool, draftPair, page, sectionTitle, LIMITS, today, addMonths } from 'remedy-core';
import { readFileSync } from 'node:fs';
import { reviewPlans, planOptions } from './logic.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const OUT = 'remedy-out/savory';

export const PLAN_FIELDS = Object.freeze({
  plan_id: { aliases: ['Plan ID', 'Plan #', 'Plan Number', 'Arrangement ID'], required: true, translate: false },
  account: { aliases: ['Account', 'Account Number', 'Acct #', 'Guarantor Account'], phi: 'account', translate: false },
  patient_name: { aliases: ['Guarantor', 'Guarantor Name', 'Patient', 'Patient Name'], phi: 'name' },
  start_date: { aliases: ['Start Date', 'Plan Start', 'First Payment Date', 'Created'], type: 'date', translate: false },
  original_balance: { aliases: ['Original Balance', 'Plan Balance', 'Plan Amount', 'Amount Financed', 'Starting Balance'], type: 'money', required: true },
  monthly_amount: { aliases: ['Monthly Amount', 'Monthly Payment', 'Installment', 'Payment Amount', 'Monthly'], type: 'money', required: true },
  day_of_month: { aliases: ['Due Day', 'Day of Month', 'Payment Day'], type: 'number', translate: false },
  autopay: { aliases: ['Autopay', 'Auto Pay', 'Card on File'] },
});
export const PAYMENT_FIELDS = Object.freeze({
  plan_id: { aliases: ['Plan ID', 'Plan #', 'Plan Number'], translate: false },
  account: { aliases: ['Account', 'Account Number', 'Acct #'], phi: 'account', translate: false },
  date: { aliases: ['Payment Date', 'Date', 'Posted', 'Posted Date'], type: 'date', translate: false },
  amount: { aliases: ['Amount', 'Payment', 'Paid', 'Payment Amount'], type: 'money', required: true },
});

const TIER = { type: 'object', additionalProperties: false, required: ['up_to', 'max_months'], properties: { up_to: { type: 'number', minimum: 0 }, max_months: { type: 'integer', minimum: 1, maximum: 120 } } };
const PLAN_CONFIG_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    grace_days: { type: 'integer', minimum: 0, maximum: 60, description: 'Days after a due date before an installment counts as missed (default 10)' },
    default_after_missed: { type: 'integer', minimum: 1, maximum: 12, description: 'Missed installments before a plan goes to default review (default 2)' },
    min_payment: { type: 'number', minimum: 0, maximum: 10000, description: 'Smallest monthly payment your policy allows' },
    tiers: { type: 'array', maxItems: 20, items: TIER, description: 'Longest term per balance: [{ up_to, max_months }]' },
    practice_name: { type: 'string', minLength: 1 },
  },
};

export const MEMORY_KINDS = Object.freeze({
  plan_grace: {
    description: 'A shorter grace period your team decided on, e.g. {"grace_days": 5, "note": "Policy change March 2026"}.',
    effect: 'uses this grace period when it is shorter than the config\'s, so missed payments show sooner. It never lengthens the grace period.',
    schema: { type: 'object', additionalProperties: false, required: ['grace_days'], properties: { grace_days: { type: 'integer', minimum: 0, maximum: 60 }, note: { type: 'string', maxLength: 300 } } },
  },
});
const MEMORY = memoryTools('savory', MEMORY_KINDS);

const files = {
  plans: { type: 'string', description: 'Payment plans under --root: plan id, account, guarantor, start date, original balance, monthly amount, due day' },
  payments: { type: 'string', description: 'Plan payments under --root: plan id (or account), date, amount' },
  config: { type: 'string', description: 'Optional plan_config JSON: grace days, missed installments before default review, minimum payment, term tiers' },
  as_of: { type: 'string', format: 'date', description: 'Date to check (YYYY-MM-DD, default today)' },
};
const cfg = (a, ctx) => (a.config ? ctx.readJson(a.config, 'plan_config') : {});
const run = (a, ctx) => { const config = cfg(a, ctx); return { config, out: reviewPlans(ctx.records(a.plans, 'plans'), ctx.records(a.payments, 'payments'), { config, facts: ctx.memoryFacts('plan_grace'), asOf: a.as_of || today() }) }; };
const sumLine = (o) => `${o.plans} plan(s): ${Object.entries(o.by_status).map(([k, v]) => `${k} ${v}`).join(', ')}. ${o.behind_total} behind, ${o.remaining_total} left to collect.${o.outside_policy ? ` ${o.outside_policy} plan(s) outside your policy.` : ''}`;
const pair = draftPair({
  prefix: 'savory', noun: 'plan_agreement', verb: 'send', category: 'binding_send', outDir: OUT, actor: 'your billing lead',
  title: 'Draft a payment plan agreement',
  description: 'Write a draft plan agreement for one balance: monthly amount, number of payments, first due date and the last payment, within your policy. Marked DRAFT; nothing is sent or signed.',
  args: { config: files.config, balance: { type: 'number', exclusiveMinimum: 0, maximum: 1000000 }, months: { type: 'integer', minimum: 1, maximum: 120 }, first_due: { type: 'string', format: 'date' }, reference: { type: 'string', maxLength: 40, description: 'Your reference for the plan (not a patient name)' } }, required: ['balance', 'months'],
  build: (a, ctx) => {
    const config = cfg(a, ctx);
    const opts = planOptions(a.balance, { config });
    if (a.months > opts.max_months) throw new Error(`${a.months} months is over your policy limit of ${opts.max_months} for ${a.balance}`);
    const monthly = Math.ceil((a.balance / a.months) * 100) / 100;
    if (monthly < opts.min_payment && a.months > 1) throw new Error(`${monthly} a month is below your minimum of ${opts.min_payment}`);
    const last = Math.round((a.balance - monthly * (a.months - 1)) * 100) / 100;
    const first = a.first_due || null;
    return { id: a.reference || `${a.balance}-${a.months}`, amount: a.balance, text: `**Between:** ${config.practice_name || '[MISSING: practice name]'} and [MISSING: guarantor name and account]\n**Payment plan agreement**\n\nBalance: **${a.balance}**. ${a.months} monthly payment(s) of **${monthly}**${last !== monthly ? ` (the last one ${last})` : ''}.\nFirst payment due: ${first || '[TO CONFIRM: first due date]'}${first ? `; last payment due ${addMonths(first, a.months - 1)}` : ''}.\n\nNo interest or fees are charged on this plan. [CHECK: keep it that way or have counsel review lending rules]\n\nIf a payment is more than ${config.grace_days ?? 10} days late we will contact you. After ${config.default_after_missed ?? 2} missed payments the plan may end and the remaining balance becomes due. [CHECK: matches your written policy]\n\nAutomatic payment: [TO CONFIRM: card or bank authorization, or pay by statement]\n\nSignature: [MISSING: guarantor signature and date]\n` };
  },
});
const refused = refusedTools([
  { name: 'card_charge', category: 'move_money', description: 'Savory never charges cards or bank accounts.' },
  { name: 'plan_cancel', category: 'binding_send', description: 'Savory never cancels plans or tells a patient a plan has ended; a person decides.' },
]);

export const manifest = defineManifest({
  name: 'savory-of-plans', version: pkg.version,
  description: 'Tracks patient payment plans against your policy: installments due after a grace period, missed payments and plans to review for default, plans paid off or ahead, monthly amounts and terms outside your policy, plan options for a new balance, and a draft plan agreement for a person to send. Patient identifiers are masked before results reach the model.',
  model: MODEL_PIN,
  caps: { maxSteps: 60, maxSpendUsd: 0 },
  configSchemas: { plan_config: PLAN_CONFIG_SCHEMA },
  memory: { prefix: 'savory', kinds: MEMORY_KINDS },
  sources: { plans: { label: 'Payment plans', args: ['plans'], fields: PLAN_FIELDS }, payments: { label: 'Plan payments', args: ['payments'], fields: PAYMENT_FIELDS } },
  argDocs: { balance: 'Balance to put on a plan', months: 'Number of monthly payments', first_due: 'First due date (YYYY-MM-DD)', limit: 'Most plans to return (the report file always has all of them)', status: 'Only plans with this status' },
  prompts: [{
    name: 'plan_review', title: 'Review payment plans',
    description: 'Walks the host model through payment plan follow-up with Savory.',
    arguments: [{ name: 'plans', description: 'plan list', required: true }, { name: 'payments', description: 'plan payments', required: true }],
    text: `You are helping a billing lead with savory-of-plans. Plans: {{plans}}. Payments: {{payments}}.

Rules: Savory never charges cards or ends plans. Be kind: a missed payment is a reason to call, not to threaten.

1. Call savory_review. List default_review, then missed_payment, with how far behind.
2. Name plans outside policy so a person can decide whether to keep them.
3. For a new balance, call savory_options and offer savory_draft_plan_agreement.
4. Call savory_write_report for the follow-up list with real names.`,
  }],
  tools: [
    { name: 'savory_review', kind: 'read', title: 'Review payment plans',
      description: 'Each plan with installments due, expected and actual paid, missed installments, remaining balance, status (default_review, missed_payment, current, ahead, paid_off) and policy issues.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['plans', 'payments'], properties: { ...files, status: { type: 'string', enum: ['default_review', 'missed_payment', 'current', 'ahead', 'paid_off'] }, limit: { type: 'integer', minimum: 1, maximum: 5000 } } },
      handler: async (a, ctx) => { const { out } = run(a, ctx); const { items, ...t } = out; return { summary: sumLine(out), ...t, ...page(a.status ? items.filter((i) => i.status === a.status) : items, a.limit || 200) }; } },
    { name: 'savory_options', kind: 'read', title: 'Plan options for a balance',
      description: 'Monthly amounts for 3 to 60 months that fit your minimum payment and term limit for this balance.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['balance'], properties: { balance: { type: 'number', exclusiveMinimum: 0, maximum: 1000000 }, config: files.config } },
      handler: async (a, ctx) => { const o = planOptions(a.balance, { config: cfg(a, ctx) }); return { summary: `${a.balance}: ${o.options.map((x) => `${x.months} x ${x.monthly}`).join(', ')} (minimum ${o.min_payment}, up to ${o.max_months} months).`, ...o }; } },
    ...pair.tools,
    reportTool({
      name: 'savory_write_report', title: 'Write the payment plan follow-up list', outDir: OUT, base: 'savory-plans',
      description: 'Write savory-plans.csv (one row per plan with blank owner and outcome columns) and savory-plans.html into out_dir (default remedy-out/savory).',
      properties: files, required: ['plans', 'payments'],
      build: (a, ctx) => {
        const { out } = run(a, ctx);
        const rows = out.items.map((i) => ({ status: i.status, plan_id: i.plan_id, account: i.account, patient_name: i.patient_name, monthly_amount: i.monthly_amount, paid: i.paid, expected_paid: i.expected_paid, missed: i.missed, remaining: i.remaining, last_payment: i.last_payment || '', policy: i.policy.join(' '), message: i.message, owner: '', outcome: '' }));
        return {
          title: { en: 'Payment plan follow-up', de: 'Ratenpläne: Nachverfolgung', fr: 'Suivi des plans de paiement', es: 'Seguimiento de planes de pago', pt: 'Acompanhamento de planos de pagamento', it: 'Monitoraggio dei piani di pagamento', ja: '分割払いプランのフォローアップ', zh: '分期付款计划跟进', ko: '분할 납부 계획 후속 조치' },
          intro: sumLine(out), rows, summary: `Plan follow-up written: ${sumLine(out)}`,
          htmlColumns: ['status', 'plan_id', 'monthly_amount', 'paid', 'expected_paid', 'missed', 'remaining', 'policy', 'message'],
          sections: [{ title: sectionTitle('by_status'), rows: Object.entries(out.by_status).map(([k, v]) => ({ status: k, count: v })), columns: ['status', 'count'] }],
          limits: [LIMITS.files, 'Plans are checked against the policy in your config. Lending and collections rules differ by state; not legal advice.', LIMITS.phi, LIMITS.advice],
        };
      },
    }),
    ...MEMORY.tools,
    ...refused.tools,
  ],
  policy: { rules: [
    { tool: 'savory_review', decision: 'allow' },
    { tool: 'savory_options', decision: 'allow' },
    { tool: 'savory_write_report', decision: 'allow' },
    ...pair.rules,
    ...MEMORY.rules,
    ...refused.rules,
    { tool: '*', decision: 'block', reason: 'Not on the Savory allowlist.' },
  ] },
});
