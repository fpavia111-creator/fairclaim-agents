import { defineManifest, MODEL_PIN, readRemits, parseCsvRows, refusedTools, memoryTools, reportTool, page, sectionTitle, exportProfile, LIMITS, today } from 'remedy-core';
import { readFileSync } from 'node:fs';
import { checkMrf, compareChargemaster, allowedAmounts, defaultPeriod } from './logic.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const OUT = 'remedy-out/angelica';
const CODE = { type: 'string', pattern: '^[A-Za-z0-9.-]{1,12}$' };

export const CDM_FIELDS = Object.freeze({
  code: { aliases: ['Code', 'CPT', 'HCPCS', 'CPT/HCPCS', 'Procedure Code', 'Charge Code', 'CDM Code'], required: true, translate: false },
  description: { aliases: ['Description', 'Charge Description', 'Item Description', 'Service'] },
  price: { aliases: ['Price', 'Charge', 'Gross Charge', 'Standard Charge', 'Unit Price', 'Amount'], type: 'money', required: true },
  revenue_code: { aliases: ['Revenue Code', 'Rev Code', 'UB Rev Code'], translate: false },
});

// Row 3 of the tall CSV, for the sources listing. The check reads the file itself (rows 1 to 3 are headers).
const MRF_COLUMNS = Object.freeze({
  description: { aliases: ['description'], required: true },
  setting: { aliases: ['setting'] },
  gross: { aliases: ['standard_charge|gross'], type: 'money', translate: false },
  discounted_cash: { aliases: ['standard_charge|discounted_cash'], type: 'money', translate: false },
  payer_name: { aliases: ['payer_name'] },
  plan_name: { aliases: ['plan_name'] },
});

const PRICE_CONFIG_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    max_age_days: { type: 'integer', minimum: 30, maximum: 400, description: 'Flag the file when last_updated_on is older than this (default 365: CMS asks for an update at least every 12 months)' },
    chargemaster_tolerance: { type: 'number', minimum: 0, maximum: 100, description: 'Allowed difference between the file and the chargemaster gross charge (default 0.01)' },
    required_codes: { type: 'array', maxItems: 1000, items: { type: 'object', additionalProperties: false, required: ['code'], properties: { code: CODE, note: { type: 'string', maxLength: 200 } } }, description: 'Codes the file must list, e.g. your shoppable services' },
    plans: { type: 'array', maxItems: 500, items: { type: 'object', additionalProperties: false, required: ['payer', 'plan_name'], properties: { payer: { type: 'string', minLength: 1 }, plan_name: { type: 'string', minLength: 1 } } }, description: 'Plan name to use for each payer in the allowed-amount table' },
  },
};

export const MEMORY_KINDS = Object.freeze({
  required_code: {
    description: 'A code the file must always list, learned from a CMS warning letter or a complaint, e.g. {"code": "70450", "note": "CT head without contrast: CMS shoppable list"}.',
    effect: 'adds an error when the code is missing from the file. It only adds a check.',
    schema: { type: 'object', additionalProperties: false, required: ['code'], properties: { code: CODE, note: { type: 'string', maxLength: 300 } } },
  },
});
const MEMORY = memoryTools('angelica', MEMORY_KINDS);

const fileArgs = {
  file: { type: 'string', description: 'The machine-readable file under --root: CMS tall CSV, template v3.0 (v2.x is read with a warning)' },
  chargemaster: { type: 'string', description: 'Optional chargemaster under --root (code, description, price) to compare gross charges and find missing items' },
  config: { type: 'string', description: 'Optional price_config JSON: file age limit, chargemaster tolerance, required codes, plan names' },
  as_of: { type: 'string', format: 'date', description: 'Date to judge the file\'s age from (YYYY-MM-DD, default today)' },
};
const allowedArgs = {
  remits: { type: 'string', description: 'Remittances under --root: an 835 file or an ERA export, covering 12 to 15 months before posting' },
  posting_date: { type: 'string', format: 'date', description: 'Date the file will be posted (YYYY-MM-DD, default today)' },
  from: { type: 'string', format: 'date', description: 'First service date to use (default 12 months before posting)' },
  to: { type: 'string', format: 'date', description: 'Last service date to use (default the day before posting)' },
  config: fileArgs.config,
};
const readConfig = (a, ctx) => (a.config ? ctx.readJson(a.config, 'price_config') : {});
const runCheck = (a, ctx) => {
  const config = readConfig(a, ctx);
  const required = [...(config.required_codes || []), ...ctx.memoryFacts('required_code').map((f) => ({ code: f.value.code, note: f.value.note, fact_id: f.id }))];
  const text = ctx.readText(a.file);
  const r = checkMrf(parseCsvRows(text), { asOf: a.as_of || today(), maxAgeDays: config.max_age_days || 365, requiredCodes: required });
  const cdm = a.chargemaster ? compareChargemaster(r.codes, ctx.records(a.chargemaster, 'chargemaster'), { tolerance: config.chargemaster_tolerance ?? 0.01 }) : null;
  return { r, cdm };
};
const runAllowed = (a, ctx) => {
  const config = readConfig(a, ctx);
  const posting = a.posting_date || today(); const def = defaultPeriod(posting);
  const { claims } = readRemits(ctx, a.remits, 'remits');
  return allowedAmounts(claims, { from: a.from || def.from, to: a.to || def.to, postingDate: posting, plans: config.plans || [] });
};
const checkLine = ({ r, cdm }) => `${r.hospital || 'Hospital name missing'}: template ${r.version || '?'}, last updated ${r.last_updated_on || '?'}, ${r.data_rows} data row(s), ${r.payer_plans.length} payer/plan pair(s). ${r.errors} error(s), ${r.warnings} warning(s)${r.errors ? ` (${Object.entries(r.by_rule).slice(0, 6).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}.${cdm ? ` Chargemaster: ${cdm.filter((x) => x.status === 'missing_from_file').length} item(s) missing from the file, ${cdm.filter((x) => x.status === 'gross_differs').length} gross charge(s) differ.` : ''}`;
const allowedLine = (o) => `${o.rows.length} payer/code row(s) from ${o.lines_used} remittance line(s), ${o.from} to ${o.to} (left out: ${o.skipped.reversal} reversal(s), ${o.skipped.zero} $0 line(s), ${o.skipped.outside} outside the period).${o.notes.length ? ` ${o.notes.join(' ')}` : ''}`;
const refused = refusedTools([
  { name: 'mrf_publish', category: 'go_live', description: 'Angelica never posts the file to your website; a person does, after the attester signs off.' },
  { name: 'chargemaster_update', category: 'go_live', description: 'Angelica never changes prices in the chargemaster.' },
]);

export const manifest = defineManifest({
  name: 'angelica-of-prices', version: pkg.version,
  description: 'Hospital price transparency without the guesswork: checks a machine-readable file against the CMS tall CSV template v3.0 (general headers, attestation, code pairs, valid values and the twelve conditional rules), compares it with the chargemaster, and computes the median, 10th and 90th percentile allowed amounts and counts from 835s the way CMS describes. No patient data is needed; remittance patients are masked anyway.',
  model: MODEL_PIN,
  caps: { maxSteps: 60, maxSpendUsd: 0 },
  configSchemas: { price_config: PRICE_CONFIG_SCHEMA },
  memory: { prefix: 'angelica', kinds: MEMORY_KINDS },
  sources: {
    file: { label: 'Machine-readable file (CMS tall CSV; read row by row, three header rows)', published: 'CMS template', args: ['file'], fields: MRF_COLUMNS, profiles: [exportProfile('cms_hpt_csv_tall_v3', {}), exportProfile('cms_hpt_csv_tall', {})] },
    chargemaster: { label: 'Chargemaster', args: ['chargemaster'], fields: CDM_FIELDS },
  },
  argDocs: { limit: 'Most rows to return (the report file always has all of them)', severity: 'Only issues of this severity', rule: 'Only issues for this rule (e.g. rule_1, attestation, count_format)' },
  prompts: [{
    name: 'price_transparency_check', title: 'Check the price transparency file',
    description: 'Walks the host model through a machine-readable file check with Angelica.',
    arguments: [{ name: 'file', description: 'tall CSV machine-readable file', required: true }, { name: 'chargemaster', description: 'chargemaster export', required: false }],
    text: `You are helping a hospital revenue integrity lead with angelica-of-prices. File: {{file}}. Chargemaster: {{chargemaster}}.

Rules: Angelica never posts files or changes prices. It checks form and manner against the CMS template; it cannot tell whether a negotiated rate is the one in the contract. Do not say a file is compliant: say it passed or failed these checks.

1. Call angelica_check_file. Report attestation, general header and placeholder errors first, then conditional rule errors by rule.
2. If the template is v2, say what v3.0 adds.
3. If percentages or algorithms are used, offer angelica_allowed_amounts from 12 to 15 months of 835s.
4. Call angelica_write_report for the list.`,
  }],
  tools: [
    { name: 'angelica_check_file', kind: 'read', title: 'Check the machine-readable file',
      description: 'Every error and warning with its row, column and CMS rule: general headers, attestation, placeholders, column headers, code and code type pairs, valid values, number formats, the conditional rules, file age and required codes; plus the chargemaster comparison when one is given.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['file'], properties: { ...fileArgs, severity: { type: 'string', enum: ['error', 'warning'] }, rule: { type: 'string', maxLength: 40 }, limit: { type: 'integer', minimum: 1, maximum: 5000 } } },
      handler: async (a, ctx) => { const x = runCheck(a, ctx); const { codes, issues, ...t } = x.r; let list = a.severity ? issues.filter((i) => i.severity === a.severity) : issues; if (a.rule) list = list.filter((i) => i.rule === a.rule); return { summary: checkLine(x), ...t, codes_listed: codes.size, ...(x.cdm ? { chargemaster: x.cdm.slice(0, 200) } : {}), ...page(list, a.limit || 200) }; } },
    { name: 'angelica_allowed_amounts', kind: 'read', title: 'Compute allowed amounts from 835s',
      description: 'Median, 10th and 90th percentile allowed amounts and the count per payer, plan and code from remittances, using the CMS rule (next highest observed amount between two values; $0 and reversals left out; count as 0, "1 through 10" or the number).',
      inputSchema: { type: 'object', additionalProperties: false, required: ['remits'], properties: { ...allowedArgs, code: { type: 'string', maxLength: 12, description: 'Only this code' }, limit: { type: 'integer', minimum: 1, maximum: 5000 } } },
      handler: async (a, ctx) => { const o = runAllowed(a, ctx); const { rows, ...t } = o; return { summary: allowedLine(o), ...t, ...page(a.code ? rows.filter((r) => r.code === a.code.toUpperCase()) : rows, a.limit || 200) }; } },
    reportTool({
      name: 'angelica_write_report', title: 'Write the file check', outDir: OUT, base: 'angelica-file-check',
      description: 'Write angelica-file-check.csv (one row per issue with blank owner and fixed columns) and angelica-file-check.html (with the chargemaster comparison) into out_dir (default remedy-out/angelica).',
      properties: fileArgs, required: ['file'],
      build: (a, ctx) => {
        const x = runCheck(a, ctx);
        const rows = x.r.issues.map((i) => ({ severity: i.severity, rule: i.rule, row: i.row ?? '', column: i.column || '', message: i.message, owner: '', fixed: '' }));
        return {
          title: { en: 'Price transparency file check', de: 'Prüfung der Preistransparenz-Datei', fr: 'Contrôle du fichier de transparence des prix', es: 'Revisión del archivo de transparencia de precios', pt: 'Verificação do arquivo de transparência de preços', it: 'Controllo del file di trasparenza dei prezzi', ja: '価格透明性ファイルのチェック', zh: '价格透明度文件检查', ko: '가격 투명성 파일 점검' },
          intro: checkLine(x), rows, summary: `File check written: ${checkLine(x)}`,
          htmlColumns: ['severity', 'rule', 'row', 'column', 'message'],
          sections: x.cdm ? [{ title: sectionTitle('by_code'), rows: x.cdm, columns: ['status', 'code', 'description', 'chargemaster', 'file', 'message'] }] : [],
          limits: [LIMITS.files, 'Checks follow the CMS CSV data dictionary and template v3.0 as published on GitHub (read 2026-11-17). Passing them is not a finding of compliance: CMS also reviews whether the charges are complete and true, and the attester signs for that.', LIMITS.advice],
        };
      },
    }),
    reportTool({
      name: 'angelica_write_allowed', title: 'Write the allowed-amount table', outDir: OUT, base: 'angelica-allowed-amounts',
      description: 'Write angelica-allowed-amounts.csv with the CMS column names (payer_name, plan_name, code, code_type, median_amount, 10th_percentile, 90th_percentile, count) and an HTML page into out_dir (default remedy-out/angelica).',
      properties: allowedArgs, required: ['remits'],
      build: (a, ctx) => {
        const o = runAllowed(a, ctx);
        const rows = o.rows.map((r) => ({ payer_name: r.payer_name, plan_name: r.plan_name || '', code: r.code, code_type: r.code_type, modifiers: r.modifiers, median_amount: r.median_amount, '10th_percentile': r['10th_percentile'], '90th_percentile': r['90th_percentile'], count: r.count }));
        return {
          title: { en: 'Allowed amounts for the price transparency file', de: 'Erstattete Beträge für die Preistransparenz-Datei', fr: 'Montants admis pour le fichier de transparence des prix', es: 'Importes permitidos para el archivo de transparencia', pt: 'Valores permitidos para o arquivo de transparência', it: 'Importi ammessi per il file di trasparenza', ja: '価格透明性ファイル用の許容額', zh: '价格透明度文件的允许金额', ko: '가격 투명성 파일용 허용 금액' },
          intro: allowedLine(o), rows, summary: `Allowed-amount table written: ${allowedLine(o)}`,
          limits: [LIMITS.files, 'Allowed amounts come from the remittances you supply. Use 12 to 15 months of 835 data (or an equivalent source); a count of 0 needs a note in the file explaining why.', LIMITS.advice],
        };
      },
    }),
    ...MEMORY.tools,
    ...refused.tools,
  ],
  policy: { rules: [
    { tool: 'angelica_check_file', decision: 'allow' },
    { tool: 'angelica_allowed_amounts', decision: 'allow' },
    { tool: 'angelica_write_report', decision: 'allow' },
    { tool: 'angelica_write_allowed', decision: 'allow' },
    ...MEMORY.rules,
    ...refused.rules,
    { tool: '*', decision: 'block', reason: 'Not on the Angelica allowlist.' },
  ] },
});
