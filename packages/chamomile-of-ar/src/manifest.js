import { defineManifest, MODEL_PIN, refusedTools, memoryTools, reportTool, findItem, page, sectionTitle, exportProfile, LIMITS, today } from 'remedy-core';
import { readFileSync } from 'node:fs';
import { ageClaims, filingLimit, BUCKETS } from './logic.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const OUT = 'remedy-out/chamomile';

export const AR_FIELDS = Object.freeze({
  claim_id: { aliases: ['Claim ID', 'Claim Number', 'Claim #', 'Claim No', 'Encounter ID', 'Visit ID', 'Ticket Number'], required: true, translate: false },
  patient_name: { aliases: ['Patient', 'Patient Name', 'Pt Name'], phi: 'name' },
  member_id: { aliases: ['Member ID', 'Subscriber ID', 'Insurance ID', 'Policy Number'], phi: 'member_id', translate: false },
  payer: { aliases: ['Payer', 'Primary Payer', 'Insurance', 'Insurance Name', 'Carrier', 'Primary Insurance', 'Current Payer', 'Responsible Payer'] },
  provider: { aliases: ['Provider', 'Rendering Provider', 'Provider Name'] },
  date_of_service: { aliases: ['DOS', 'Date of Service', 'Service Date', 'From Date', 'Visit Date'], type: 'date' },
  submitted_date: { aliases: ['Submitted', 'Submit Date', 'Date Submitted', 'Billed Date', 'First Billed', 'Claim Date', 'Last Billed', 'Bill Date'], type: 'date' },
  last_activity: { aliases: ['Last Activity', 'Last Follow-up', 'Last Followup', 'Last Touched', 'Last Worked', 'Follow Up Date', 'Last Note Date'], type: 'date', translate: false },
  charge: { aliases: ['Charge', 'Charges', 'Billed', 'Total Charge', 'Claim Amount'], type: 'money' },
  balance: { aliases: ['Balance', 'Outstanding', 'Open Balance', 'Insurance Balance', 'Ins Balance', 'Claim Balance', 'Amount Due', 'AR Balance'], type: 'money', required: true },
  status: { aliases: ['Status', 'Claim Status', 'Current Status'] },
  responsible: { aliases: ['Responsible Party', 'Responsibility', 'Bucket', 'Financial Responsibility', 'Balance Type'], translate: false },
});

const AR_CONFIG_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    payers: { type: 'array', maxItems: 500, items: { type: 'object', additionalProperties: false, required: ['name', 'timely_days'], properties: { name: { type: 'string', minLength: 1 }, timely_days: { type: 'integer', minimum: 1, maximum: 1095 } } } },
    default_timely_days: { type: 'integer', minimum: 1, maximum: 1095, description: 'Filing limit for payers not listed (leave out to flag them instead)' },
    age_from: { type: 'string', enum: ['service', 'submitted'], description: 'Age balances from the service date (default) or the submission date' },
    follow_up_days: { type: 'integer', minimum: 1, maximum: 365, description: 'Days after submission with no payment before a claim needs a status check (default 30)' },
    quiet_days: { type: 'integer', minimum: 0, maximum: 365, description: 'Skip claims someone worked within this many days (default 14)' },
    warn_days: { type: 'integer', minimum: 0, maximum: 365, description: 'Warn this many days before the filing limit (default 30)' },
  },
};

export const MEMORY_KINDS = Object.freeze({
  timely_filing: {
    description: 'A payer\'s filing limit learned from a contract or a denial, e.g. {"payer": "Demo Medicaid Plan", "days": 90, "note": "Provider manual section 4"}.',
    effect: 'uses this limit when it is shorter than the config\'s; the shortest limit always wins, so memory can only make the warning come sooner.',
    schema: { type: 'object', additionalProperties: false, required: ['payer', 'days'], properties: { payer: { type: 'string', minLength: 1, maxLength: 120 }, days: { type: 'integer', minimum: 1, maximum: 1095 }, note: { type: 'string', maxLength: 300 } } },
  },
});
const MEMORY = memoryTools('chamomile', MEMORY_KINDS);

const files = {
  ar: { type: 'string', description: 'Open A/R export under --root (CSV, Excel, JSON), one row per claim with payer, service date, submitted date and balance' },
  config: { type: 'string', description: 'Optional ar_config JSON: filing limit per payer, aging basis, follow-up and warning days' },
  as_of: { type: 'string', format: 'date', description: 'Date to age from (YYYY-MM-DD, default today)' },
};
const run = (a, ctx) => {
  const config = a.config ? ctx.readJson(a.config, 'ar_config') : {};
  return { config, out: ageClaims(ctx.records(a.ar, 'ar'), { config, facts: ctx.memoryFacts('timely_filing'), asOf: a.as_of || today() }) };
};
const sumLine = (o) => `${o.claims_open} open claim(s): insurance ${o.insurance_balance} (${o.over_90_percent}% over 90 days), patient ${o.patient_balance}. At risk of timely filing: ${o.at_risk_balance}. ${Object.entries(o.by_flag).map(([k, v]) => `${k} ${v}`).join(', ')}.${o.payers_without_limit.length ? ` No filing limit set for: ${o.payers_without_limit.join(', ')}.` : ''}`;
const refused = refusedTools([
  { name: 'write_off_post', category: 'move_money', description: 'Chamomile never writes off balances; a person decides by your write-off policy.' },
  { name: 'payer_call', category: 'binding_send', description: 'Chamomile never calls or messages payers.' },
]);

export const manifest = defineManifest({
  name: 'chamomile-of-ar', version: pkg.version,
  description: 'Ages open insurance A/R by payer and bucket, warns before each payer\'s timely-filing limit passes on unbilled claims, finds claims submitted after the limit or with no payer response, and ranks the follow-up queue by balance and age. Patient identifiers are masked before results reach the model.',
  model: MODEL_PIN,
  caps: { maxSteps: 60, maxSpendUsd: 0 },
  configSchemas: { ar_config: AR_CONFIG_SCHEMA },
  memory: { prefix: 'chamomile', kinds: MEMORY_KINDS },
  sources: { ar: { label: 'Open A/R', args: ['ar'], fields: AR_FIELDS, profiles: [exportProfile('athena_claims', { claim_id: 'Claim ID', payer: 'Primary Payer', status: 'Claim Status', balance: 'Outstanding' }), exportProfile('ecw_claims', { claim_id: 'Claim No', payer: 'Insurance Name', status: 'Claim Status', balance: 'Balance' })] } },
  argDocs: { claim_id: 'Claim number from chamomile_age; a pseudonym in strict masking mode', limit: 'Most claims to return (the report file always has all of them)', flag: 'Only claims with this flag' },
  prompts: [{
    name: 'ar_follow_up', title: 'Plan this week\'s A/R follow-up',
    description: 'Walks the host model through aging and the follow-up queue with Chamomile.',
    arguments: [{ name: 'ar', description: 'open A/R export', required: true }, { name: 'config', description: 'ar_config JSON', required: false }],
    text: `You are helping an A/R lead plan follow-up with chamomile-of-ar. A/R: {{ar}}. Config: {{config}}.

Rules: Chamomile never writes off balances or calls payers; write_off_post is blocked. Patient names are pseudonyms in results.

1. Call chamomile_age. Report insurance A/R, the share over 90 days and the balance at risk of timely filing.
2. List file_now and past_filing_limit claims first: they lose money if they wait.
3. If a payer has no filing limit, ask the person for it; offer chamomile_learn (kind timely_filing).
4. Call chamomile_write_report for the call queue with real names.`,
  }],
  tools: [
    { name: 'chamomile_age', kind: 'read', title: 'Age open A/R',
      description: 'Every open claim with its age, bucket, filing limit and days left, a flag (file_now, past_filing_limit, filed_late, follow_up, waiting, unbilled, patient_balance) and the next step, ranked by balance and age; aging grid by payer.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['ar'], properties: { ...files, flag: { type: 'string', enum: ['file_now', 'past_filing_limit', 'filed_late', 'follow_up', 'waiting', 'unbilled', 'patient_balance'] }, limit: { type: 'integer', minimum: 1, maximum: 5000 } } },
      handler: async (a, ctx) => { const { out } = run(a, ctx); const { items, ...t } = out; return { summary: sumLine(out), buckets: BUCKETS, ...t, ...page(a.flag ? items.filter((i) => i.flag === a.flag) : items, a.limit || 100) }; } },
    { name: 'chamomile_filing_limit', kind: 'read', title: 'Show a payer\'s filing limit',
      description: 'The filing limit Chamomile uses for one payer and where it comes from (config, memory or default).',
      inputSchema: { type: 'object', additionalProperties: false, required: ['payer'], properties: { payer: { type: 'string', minLength: 1, description: 'Payer name as it appears in the A/R export (letter case and punctuation do not matter)' }, config: files.config } },
      handler: async (a, ctx) => { const config = a.config ? ctx.readJson(a.config, 'ar_config') : {}; const l = filingLimit(config, ctx.memoryFacts('timely_filing'), a.payer); return { summary: l ? `${a.payer}: ${l.days} days (${l.source}).` : `No filing limit for ${a.payer}: set it in the config or teach it.`, limit: l }; } },
    { name: 'chamomile_explain', kind: 'read', title: 'Explain one claim',
      description: 'Show one open claim with its age, filing limit and why it got its flag.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['ar', 'claim_id'], properties: { ...files, claim_id: { type: 'string' } } },
      handler: async (a, ctx) => { const { out } = run(a, ctx); const i = findItem(out.items, 'claim_id', a.claim_id, ctx, { label: 'claim' }); return { summary: `${i.claim_id}: ${i.balance} with ${i.payer}, ${i.age_days} days old, ${i.flag}. ${i.next_step}`, claim: i }; } },
    reportTool({
      name: 'chamomile_write_report', title: 'Write the A/R follow-up queue', outDir: OUT, base: 'chamomile-ar',
      description: 'Write chamomile-ar.csv (the ranked follow-up queue with blank owner, call reference and notes columns) and chamomile-ar.html (aging grid by payer) into out_dir (default remedy-out/chamomile).',
      properties: files, required: ['ar'],
      build: (a, ctx) => {
        const { out } = run(a, ctx);
        const rows = out.items.map((i) => ({ priority: i.priority, flag: i.flag, claim_id: i.claim_id, payer: i.payer, patient_name: i.patient_name, date_of_service: i.date_of_service, submitted: i.submitted_date || '', age_days: i.age_days, bucket: i.bucket, balance: i.balance, days_left: i.filing_days_left ?? '', next_step: i.next_step, owner: '', reference: '', notes: '' }));
        return {
          title: { en: 'A/R follow-up queue', de: 'Forderungen: Nachverfolgung', fr: 'File de relance des créances', es: 'Cola de seguimiento de cuentas por cobrar', pt: 'Fila de cobrança de contas a receber', it: 'Coda di sollecito crediti', ja: '売掛金フォローアップ一覧', zh: '应收账款跟进队列', ko: '미수금 후속 조치 대기열' },
          intro: sumLine(out), rows, summary: `A/R queue written: ${sumLine(out)}`,
          htmlColumns: ['flag', 'claim_id', 'payer', 'date_of_service', 'age_days', 'bucket', 'balance', 'days_left', 'next_step'],
          sections: [{ title: sectionTitle('by_bucket'), rows: Object.entries(out.aging_by_payer).map(([p, g]) => ({ payer: p, ...g })), columns: ['payer', ...BUCKETS, 'total'] }],
          limits: [LIMITS.files, 'Filing limits are the ones in your config and memory; contracts and state rules can differ.', LIMITS.phi, LIMITS.advice],
        };
      },
    }),
    ...MEMORY.tools,
    ...refused.tools,
  ],
  policy: { rules: [
    { tool: 'chamomile_age', decision: 'allow' },
    { tool: 'chamomile_filing_limit', decision: 'allow' },
    { tool: 'chamomile_explain', decision: 'allow' },
    { tool: 'chamomile_write_report', decision: 'allow' },
    ...MEMORY.rules,
    ...refused.rules,
    { tool: '*', decision: 'block', reason: 'Not on the Chamomile allowlist.' },
  ] },
});
