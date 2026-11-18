import { defineManifest, MODEL_PIN, CLAIM_FIELDS, REMIT_FIELDS, readClaims, readRemits, refusedTools, memoryTools, reportTool, page, sectionTitle, exportProfile, LIMITS } from 'fairclaim-core';
import { readFileSync } from 'node:fs';
import { computeKpis, KPIS, TARGET_KEYS } from './logic.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const OUT = 'remedy-out/kpis';
const KPI_ENUM = { type: 'string', enum: [...TARGET_KEYS] };

const KPI_CONFIG_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    as_of: { type: 'string', format: 'date', description: 'Date the KPIs are measured on (default: the latest date in the files)' },
    period_days: { type: 'integer', minimum: 7, maximum: 366, description: 'Days of charges averaged for days in A/R (default 90)' },
    no_response_days: { type: 'integer', minimum: 7, maximum: 180, description: 'Days after sending with no remittance before a claim counts as unanswered (default 30)' },
    targets: { type: 'object', additionalProperties: false, description: 'Your own targets, e.g. {"denial_rate": 8, "days_in_ar": 40}. Percent KPIs are 0-100. There are no built-in targets.',
      properties: Object.fromEntries(TARGET_KEYS.map((k) => [k, { type: 'number', minimum: 0, maximum: KPIS[k].unit === '%' ? 100 : 3650, description: `${KPIS[k].better === 'lower' ? 'Most' : 'Least'} acceptable ${k.replace(/_/g, ' ')} (${KPIS[k].unit})` }])) },
  },
};

export const MEMORY_KINDS = Object.freeze({
  payer_kpi_watch: {
    description: 'A limit for one payer\'s KPI that the practice wants watched, e.g. {"payer": "Demo Medicaid Plan", "kpi": "median_days_to_pay", "limit": 30, "note": "Slow since the portal change (fictional)"}.',
    effect: 'adds an alert when that payer is past the limit. It only adds alerts.',
    schema: { type: 'object', additionalProperties: false, required: ['payer', 'kpi', 'limit'], properties: { payer: { type: 'string', minLength: 1, maxLength: 120 }, kpi: KPI_ENUM, limit: { type: 'number', minimum: 0, maximum: 3650 }, note: { type: 'string', maxLength: 300 } } },
  },
});
const MEMORY = memoryTools('kpis', MEMORY_KINDS);

const files = {
  claims: { type: 'string', description: 'Claims under --root: an 837P/837I or a claim export with claim id, payer, provider, date of service, charges and, where possible, the date submitted' },
  remits: { type: 'string', description: 'Remittances under --root: one or more 835s in one file, or an ERA/payment export' },
  config: { type: 'string', description: 'Optional kpi_config JSON: as-of date, period, no-response days and your own targets' },
  as_of: { type: 'string', format: 'date', description: 'Date to measure on (YYYY-MM-DD); overrides the config; default the latest date in the files' },
};
const run = (a, ctx) => {
  const config = a.config ? ctx.readJson(a.config, 'kpi_config') : {};
  return computeKpis(readClaims(ctx, a.claims, 'claims').claims, readRemits(ctx, a.remits, 'remits').claims, { config, facts: ctx.memoryFacts('payer_kpi_watch'), asOf: a.as_of || null });
};
const show = (k, v) => (v === null || v === undefined ? 'n/a' : `${v}${KPIS[k].unit === '%' ? '%' : ' days'}`);
const sumLine = (o) => `As of ${o.as_of}: ${o.claims} claim(s), ${o.adjudicated} adjudicated. Denial rate ${show('denial_rate', o.denial_rate)}, first pass ${show('first_pass_rate', o.first_pass_rate)}, net collection ${show('net_collection_rate', o.net_collection_rate)}, median days to pay ${show('median_days_to_pay', o.median_days_to_pay)}, days in A/R ${show('days_in_ar', o.days_in_ar)}. ${o.alerts.length} alert(s).`;
const GROUP_COLS = ['group', 'claims', 'charges', 'adjudicated', 'paid', 'denial_rate', 'first_pass_rate', 'net_collection_rate', 'median_days_to_pay', 'days_in_ar', 'open_claims'];
const refused = refusedTools([
  { name: 'report_send', category: 'binding_send', description: 'Fairclaim Revenue KPIs never emails or posts KPI reports; you share them.' },
  { name: 'balance_write_off', category: 'move_money', description: 'Fairclaim Revenue KPIs never adjusts or writes off balances; the billing team does in the practice system.' },
]);

export const manifest = defineManifest({
  name: 'fairclaim-revenue-kpis', version: pkg.version,
  description: 'Revenue cycle KPIs from your own claims and remittances: denial rate, first-pass rate, net collection (payer share), days to pay, days in A/R and unanswered claims, by payer, month and provider, each with how it was computed and against the targets you set. No built-in benchmarks. Patient identifiers are masked before results reach the model.',
  model: MODEL_PIN,
  caps: { maxSteps: 60, maxSpendUsd: 0 },
  configSchemas: { kpi_config: KPI_CONFIG_SCHEMA },
  memory: { prefix: 'kpis', kinds: MEMORY_KINDS },
  sources: {
    claims: { label: 'Claims (837 or claim export)', args: ['claims'], fields: CLAIM_FIELDS, profiles: [exportProfile('athena_claims', { claim_id: 'Claim ID', payer: 'Primary Payer' }), exportProfile('tebra_charges', { claim_id: 'Encounter ID', code: 'Procedure Code', date_of_service: 'Service Date', payer: 'Primary Insurance' })] },
    remits: { label: 'Remittances (835 or ERA export)', args: ['remits'], fields: REMIT_FIELDS, profiles: [exportProfile('availity_remit', { claim_id: 'Patient Control Number', payer_claim_id: 'Payer Claim Control Number', check_number: 'Check/EFT Number', paid: 'Paid Amount' }), exportProfile('waystar_remit', { claim_id: 'Patient Account', payer_claim_id: 'Payer ICN', check_number: 'Check #', paid: 'Paid Amt' })] },
  },
  argDocs: { group: 'Break the KPIs down by payer, month of service or provider', min_days: 'Only claims open at least this many days', limit: 'Most rows to return (the report file always has all of them)' },
  prompts: [{
    name: 'kpi_review', title: 'Review revenue cycle KPIs',
    description: 'Walks the host model through a monthly KPI review with Fairclaim Revenue KPIs.',
    arguments: [{ name: 'claims', description: '837 or claim export', required: true }, { name: 'remits', description: '835 or ERA export', required: true }],
    text: `You are helping a practice manager or billing lead review revenue cycle KPIs with fairclaim-revenue-kpis. Claims: {{claims}}. Remittances: {{remits}}.

Rules: Fairclaim Revenue KPIs never sends reports or touches balances. Patient names are pseudonyms in results. KPIs come only from these files: say how each was computed (the "how" field) and never compare to an industry benchmark from memory. Targets are the practice's own.

1. Call kpis_kpis. Lead with the alerts, then the KPIs that missed a target, then the data notes.
2. Call kpis_breakdown by payer to say where denials and slow pay come from; by month if the person asks about a trend.
3. Call kpis_open_claims for unanswered claims to chase.
4. If the person wants a payer watched, offer kpis_learn (kind payer_kpi_watch).
5. Call kpis_write_report for the page to share.`,
  }],
  tools: [
    { name: 'kpis_kpis', kind: 'read', title: 'Measure the revenue cycle KPIs',
      description: 'Denial rate, denied amount rate, first-pass rate, net collection rate (payer share), median and 90th percentile days to pay, days in A/R and no-response rate, each with how it was computed and its target; alerts; top denial categories; open claims by age; data notes.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['claims', 'remits'], properties: files },
      handler: async (a, ctx) => { const o = run(a, ctx); const { claims_detail, open, by_payer, by_month, by_provider, ...t } = o; return { summary: sumLine(o), ...t, payers: by_payer.length, open_claims_overdue: open.filter((x) => x.overdue).length }; } },
    { name: 'kpis_breakdown', kind: 'read', title: 'Break the KPIs down',
      description: 'The KPIs for each payer, month of service or provider: claims, charges, adjudicated, paid, denial rate, first-pass rate, net collection, median days to pay, days in A/R and open claims.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['claims', 'remits'], properties: { ...files, group: { type: 'string', enum: ['payer', 'month', 'provider'] }, limit: { type: 'integer', minimum: 1, maximum: 1000 } } },
      handler: async (a, ctx) => { const o = run(a, ctx); const g = a.group || 'payer'; const list = o[`by_${g}`]; return { summary: `${list.length} ${g}(s) as of ${o.as_of}. ${list.slice(0, 3).map((x) => `${x.group}: denial ${show('denial_rate', x.denial_rate)}, median days to pay ${show('median_days_to_pay', x.median_days_to_pay)}`).join('; ')}.`, group: g, as_of: o.as_of, ...page(list, a.limit || 200) }; } },
    { name: 'kpis_open_claims', kind: 'read', title: 'List claims with no remittance',
      description: 'Claims with no remittance yet, oldest first, with days open from the submitted date (else the date of service), age bucket and whether they are past the no-response days.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['claims', 'remits'], properties: { ...files, min_days: { type: 'integer', minimum: 0, maximum: 3650 }, limit: { type: 'integer', minimum: 1, maximum: 5000 } } },
      handler: async (a, ctx) => { const o = run(a, ctx); const list = o.open.filter((x) => a.min_days === undefined || (x.days_open ?? 0) >= a.min_days); return { summary: `${list.length} open claim(s) worth ${list.reduce((s, x) => s + x.charge, 0).toFixed(2)}; ${list.filter((x) => x.overdue).length} past ${o.no_response_days} days.`, as_of: o.as_of, by_bucket: o.open_claims_by_bucket, ...page(list, a.limit || 200) }; } },
    reportTool({
      name: 'kpis_write_report', title: 'Write the KPI report', outDir: OUT, base: 'kpis',
      description: 'Write kpis.csv (one row per KPI with value, target, met and how it was computed) and kpis.html (with alerts and tables by payer, month and age of open claims) into out_dir (default remedy-out/kpis).',
      properties: files, required: ['claims', 'remits'],
      build: (a, ctx) => {
        const o = run(a, ctx);
        const rows = Object.entries(o.kpis).map(([k, x]) => ({ kpi: k, value: x.value ?? '', unit: x.unit, target: x.target ?? '', met: x.met === null ? '' : x.met ? 'yes' : 'no', better: x.better, how: x.how }));
        const pick = (r) => Object.fromEntries(GROUP_COLS.map((c) => [c, r[c] ?? '']));
        return {
          title: { en: 'Revenue cycle KPIs', de: 'Kennzahlen des Abrechnungszyklus', fr: 'Indicateurs du cycle de revenus', es: 'Indicadores del ciclo de ingresos', pt: 'Indicadores do ciclo de receita', it: 'Indicatori del ciclo dei ricavi', ja: 'レベニューサイクル指標', zh: '收入周期指标', ko: '수익 주기 지표' },
          intro: `${sumLine(o)} ${o.alerts.map((x) => x.message).join(' ')}`.trim(), rows, summary: `KPI report written: ${sumLine(o)}`,
          htmlColumns: ['kpi', 'value', 'unit', 'target', 'met', 'how'],
          sections: [
            { title: sectionTitle('by_payer'), rows: o.by_payer.map(pick), columns: GROUP_COLS },
            { title: sectionTitle('by_month'), rows: o.by_month.map(pick), columns: GROUP_COLS },
            { title: sectionTitle('by_bucket'), rows: o.open_claims_by_bucket, columns: ['bucket', 'count', 'amount'] },
            { title: sectionTitle('by_category'), rows: o.top_denials.map((d) => ({ category: d.category, team: d.team, count: d.count, claims: d.claims, amount: d.amount })), columns: ['category', 'team', 'count', 'claims', 'amount'] },
          ],
          limits: [LIMITS.files, 'KPIs are computed only from the claims and remittances you load, as described in each row. Net collection is the payer share (patient payments are not in these files). Targets are yours; Fairclaim Revenue KPIs has no benchmarks.', ...o.data_notes, LIMITS.phi, LIMITS.advice],
        };
      },
    }),
    ...MEMORY.tools,
    ...refused.tools,
  ],
  policy: { rules: [
    { tool: 'kpis_kpis', decision: 'allow' },
    { tool: 'kpis_breakdown', decision: 'allow' },
    { tool: 'kpis_open_claims', decision: 'allow' },
    { tool: 'kpis_write_report', decision: 'allow' },
    ...MEMORY.rules,
    ...refused.rules,
    { tool: '*', decision: 'block', reason: 'Not on the Fairclaim Revenue KPIs allowlist.' },
  ] },
});
