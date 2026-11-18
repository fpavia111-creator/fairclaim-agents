import { defineManifest, MODEL_PIN, REMIT_FIELDS, CLAIM_FIELDS, readRemits, readClaims, refusedTools, memoryTools, reportTool, page, sectionTitle, LIMITS, payerKey } from 'fairclaim-core';
import { readFileSync } from 'node:fs';
import { scorePayers } from './logic.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const OUT = 'remedy-out/payers';
const TARGETS = { days_to_pay: { type: 'number', minimum: 1, maximum: 365 }, denial_rate: { type: 'number', minimum: 0, maximum: 100 }, paid_percent: { type: 'number', minimum: 0, maximum: 100 } };

const PAYER_CONFIG_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    targets: { type: 'object', additionalProperties: false, properties: TARGETS, description: 'Targets for every payer: median days to pay, percent of claims with a denial, percent of billed paid' },
    payers: { type: 'array', maxItems: 500, items: { type: 'object', additionalProperties: false, required: ['name'], properties: { name: { type: 'string', minLength: 1 }, ...TARGETS } } },
  },
};

export const MEMORY_KINDS = Object.freeze({
  payer_target: {
    description: 'A stricter target for one payer, e.g. {"payer": "Demo Medicaid Plan", "days_to_pay": 30, "note": "State prompt-pay rule (check it)"}.',
    effect: 'uses this target when it is stricter than the config\'s. It only adds flags; it never loosens a target.',
    schema: { type: 'object', additionalProperties: false, required: ['payer'], properties: { payer: { type: 'string', minLength: 1, maxLength: 120 }, ...TARGETS, note: { type: 'string', maxLength: 300 } } },
    check: (v) => (['days_to_pay', 'denial_rate', 'paid_percent'].some((k) => Number.isFinite(v[k])) ? null : 'give at least one of days_to_pay, denial_rate, paid_percent'),
  },
});
const MEMORY = memoryTools('payers', MEMORY_KINDS);

const files = {
  remits: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'string' }, description: '835 files or payment exports under --root' },
  claims: { type: 'string', description: 'Optional claims under --root (837 or claim export with a submitted date) for days to pay' },
  config: { type: 'string', description: 'Optional payer_config JSON: targets for all payers and per payer' },
};
const run = (a, ctx) => {
  const config = a.config ? ctx.readJson(a.config, 'payer_config') : {};
  const remit = a.remits.flatMap((p) => readRemits(ctx, p).claims);
  const submitted = new Map();
  if (a.claims) for (const c of readClaims(ctx, a.claims, 'claims').claims) if (c.submitted_date) submitted.set(String(c.claim_id), c.submitted_date);
  return { out: scorePayers(remit, { submitted, config, facts: ctx.memoryFacts('payer_target') }) };
};
const sumLine = (o) => `${o.payers.length} payer(s), ${o.claims} claim(s): ${o.denial_rate}% had a denial; median ${o.days_to_pay_median ?? 'n/a'} days to pay${o.untimed_claims ? ` (${o.untimed_claims} claim(s) with no submission date)` : ''}. ${o.payers.filter((p) => p.flags.length).map((p) => `${p.payer}: ${p.flags.map((f) => f.flag).join(', ')}`).join('; ') || 'No payer misses a target.'}`;
const refused = refusedTools([
  { name: 'payer_complaint_file', category: 'binding_send', description: 'Fairclaim Payer Scorecards never files complaints with payers or regulators; a person decides and files.' },
]);

export const manifest = defineManifest({
  name: 'fairclaim-payer-scorecards', version: pkg.version,
  description: 'Scores each payer from your 835s and claim submissions: days to pay, denial rate and top denial reasons, share of billed paid, reversals, and a month-by-month trend, against your targets. Patient identifiers are masked before results reach the model.',
  model: MODEL_PIN,
  caps: { maxSteps: 60, maxSpendUsd: 0 },
  configSchemas: { payer_config: PAYER_CONFIG_SCHEMA },
  memory: { prefix: 'payers', kinds: MEMORY_KINDS },
  sources: { remits: { label: 'Remittances (835 or payment export)', args: ['remits'], fields: REMIT_FIELDS }, claims: { label: 'Claims with submitted dates', args: ['claims'], fields: CLAIM_FIELDS } },
  argDocs: { payer: 'Payer name as it appears on the remittance', limit: 'Most claims to return (the report file always has all of them)' },
  prompts: [{
    name: 'payer_scorecard', title: 'Score payers for the month',
    description: 'Walks the host model through a payer scorecard with Fairclaim Payer Scorecards.',
    arguments: [{ name: 'remits', description: '835 files', required: true }, { name: 'claims', description: 'claims with submission dates', required: false }],
    text: `You are helping a revenue cycle manager with fairclaim-payer-scorecards. Remits: {{remits}}. Claims: {{claims}}.

Rules: Fairclaim Payer Scorecards never contacts payers or regulators. Patient names are pseudonyms in results.

1. Call payers_scorecard. Rank payers by flags and say which targets they miss.
2. For a slow payer, give the median days and the share paid within 30 days; for high denials, the top reasons.
3. Call payers_payer for a payer the person asks about.
4. Call payers_write_report for the scorecard.`,
  }],
  tools: [
    { name: 'payers_scorecard', kind: 'read', title: 'Score payers',
      description: 'Per payer: claims, billed, paid, percent of billed paid, denial rate, top denial categories, median and average days to pay, share paid within 30 days, reversals, flags against targets, and a month-by-month trend.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['remits'], properties: files },
      handler: async (a, ctx) => { const { out } = run(a, ctx); const { claim_rows, ...t } = out; return { summary: sumLine(out), ...t }; } },
    { name: 'payers_payer', kind: 'read', title: 'One payer in detail',
      description: 'The scorecard for one payer and its claims with days to pay and denial categories, slowest first.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['remits', 'payer'], properties: { ...files, payer: { type: 'string', minLength: 1 }, limit: { type: 'integer', minimum: 1, maximum: 5000 } } },
      handler: async (a, ctx) => { const { out } = run(a, ctx); const p = out.payers.find((x) => payerKey(x.payer) === payerKey(a.payer)); if (!p) throw new Error(`payer ${a.payer} is not on these remittances (payers: ${out.payers.map((x) => x.payer).join(', ')})`); const rows = out.claim_rows.filter((c) => c.payer === p.payer).sort((x, y) => (y.days_to_pay ?? -1) - (x.days_to_pay ?? -1)); return { summary: `${p.payer}: ${p.claims} claim(s), ${p.denial_rate}% with a denial, median ${p.days_to_pay_median ?? 'n/a'} days to pay, ${p.paid_percent}% of billed paid.${p.flags.length ? ` ${p.flags.map((f) => f.message).join(' ')}` : ''}`, scorecard: p, ...page(rows, a.limit || 200) }; } },
    reportTool({
      name: 'payers_write_report', title: 'Write the payer scorecard', outDir: OUT, base: 'payers',
      description: 'Write payers.csv (one row per payer with blank owner and action columns) and payers.html (with the month-by-month trend) into out_dir (default remedy-out/payers).',
      properties: files, required: ['remits'],
      build: (a, ctx) => {
        const { out } = run(a, ctx);
        const rows = out.payers.map((p) => ({ payer: p.payer, claims: p.claims, billed: p.billed, paid: p.paid, paid_percent: p.paid_percent, denial_rate: p.denial_rate, top_denials: p.top_denials.join('; '), days_to_pay_median: p.days_to_pay_median ?? '', within_30_percent: p.within_30_percent ?? '', reversals: p.reversals, flags: p.flags.map((f) => f.message).join(' '), owner: '', action: '' }));
        return {
          title: { en: 'Payer scorecard', de: 'Kostenträger-Scorecard', fr: 'Tableau de bord des payeurs', es: 'Cuadro de mando de pagadores', pt: 'Painel de desempenho das operadoras', it: 'Scheda di valutazione dei pagatori', ja: '支払者スコアカード', zh: '支付方评分卡', ko: '지불자 성과표' },
          intro: sumLine(out), rows, summary: `Payer scorecard written: ${sumLine(out)}`,
          htmlColumns: ['payer', 'claims', 'paid_percent', 'denial_rate', 'top_denials', 'days_to_pay_median', 'within_30_percent', 'flags'],
          sections: [{ title: sectionTitle('by_month'), rows: out.payers.flatMap((p) => p.trend.map((m) => ({ payer: p.payer, ...m }))), columns: ['payer', 'month', 'claims', 'denial_rate', 'paid', 'days_to_pay_median'] }],
          limits: [LIMITS.files, 'Days to pay need a submission date for each claim; claims without one are counted but not timed.', LIMITS.advice],
        };
      },
    }),
    ...MEMORY.tools,
    ...refused.tools,
  ],
  policy: { rules: [
    { tool: 'payers_scorecard', decision: 'allow' },
    { tool: 'payers_payer', decision: 'allow' },
    { tool: 'payers_write_report', decision: 'allow' },
    ...MEMORY.rules,
    ...refused.rules,
    { tool: '*', decision: 'block', reason: 'Not on the Fairclaim Payer Scorecards allowlist.' },
  ] },
});
