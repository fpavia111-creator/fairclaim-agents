import { defineManifest, MODEL_PIN, CLAIM_FIELDS, readClaims, refusedTools, memoryTools, reportTool, findItem, page, sectionTitle, exportProfile, LIMITS } from 'remedy-core';
import { readFileSync } from 'node:fs';
import { checkLabs, PANELS } from './logic.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const OUT = 'remedy-out/tarragon';
const LAB = { type: 'string', pattern: '^(8\\d{4}|\\d{4}U|36415)$' };
const DX = { type: 'string', pattern: '^[A-Za-z]\\d[0-9A-Za-z.]{0,6}$' };

export const HISTORY_FIELDS = Object.freeze({
  patient_name: { aliases: ['Patient', 'Patient Name'] },
  member_id: { aliases: ['Member ID', 'Subscriber ID', 'Insurance ID', 'MBI'], translate: false },
  date_of_service: { aliases: ['Date of Service', 'DOS', 'Collection Date', 'Service Date'], type: 'date', required: true, translate: false },
  code: { aliases: ['CPT', 'Code', 'Test Code', 'Procedure Code'], required: true, translate: false },
});

const LAB_CONFIG_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    clia: { type: 'string', pattern: '^\\d{2}[Dd]\\d{7}$', description: 'Your lab\'s CLIA number' },
    certificate: { type: 'string', enum: ['waiver', 'ppm', 'compliance', 'accreditation'], description: 'Your CLIA certificate type; with "waiver" only waived tests may be billed' },
    waived_codes: { type: 'array', maxItems: 500, items: LAB, description: 'Tests you perform as waived (they need QW unless listed in qw_exempt). Take them from the CMS waived test list for your test kits.' },
    qw_exempt: { type: 'array', maxItems: 100, items: LAB, description: 'Waived tests that payers take without QW' },
    panels: { type: 'array', maxItems: 50, items: { type: 'object', additionalProperties: false, required: ['code', 'components'], properties: { code: LAB, name: { type: 'string', maxLength: 120 }, components: { type: 'array', minItems: 2, maxItems: 30, items: LAB } } }, description: 'Extra panels beyond the built-in metabolic, lipid and hepatic panels' },
    dx_rules: { type: 'array', maxItems: 500, items: { type: 'object', additionalProperties: false, required: ['code', 'dx_prefixes'], properties: { code: LAB, dx_prefixes: { type: 'array', minItems: 1, maxItems: 200, items: DX }, payer: { type: 'string', maxLength: 120 }, note: { type: 'string', maxLength: 300 } } }, description: 'Diagnoses (ICD-10 prefixes) that support a test, e.g. from a coverage policy' },
    frequency: { type: 'array', maxItems: 200, items: { type: 'object', additionalProperties: false, required: ['code', 'months'], properties: { code: LAB, months: { type: 'integer', minimum: 1, maximum: 120 }, max: { type: 'integer', minimum: 1, maximum: 50 }, note: { type: 'string', maxLength: 300 } } }, description: 'Most times a test may be done in a number of months' },
  },
};

export const MEMORY_KINDS = Object.freeze({
  lab_dx_rule: {
    description: 'Diagnoses a payer accepts for a test, learned from a denial, e.g. {"code": "83036", "dx_prefixes": ["E08", "E09", "E10", "E11", "E13", "R73"], "payer": "Test Medicare Contractor", "note": "Denied with only Z00.00 (fictional)"}.',
    effect: 'warns when a claim for that test has none of those diagnoses. It only adds a check.',
    schema: { type: 'object', additionalProperties: false, required: ['code', 'dx_prefixes'], properties: { code: LAB, dx_prefixes: { type: 'array', minItems: 1, maxItems: 200, items: DX }, payer: { type: 'string', maxLength: 120 }, note: { type: 'string', maxLength: 300 } } },
  },
});
const MEMORY = memoryTools('tarragon', MEMORY_KINDS);

const files = {
  claims: { type: 'string', description: 'Lab claims under --root: an 837P or a claim export with CLIA, test codes, modifiers, units and diagnoses' },
  history: { type: 'string', description: 'Optional earlier tests under --root (patient or member id, date, code) for frequency limits' },
  config: { type: 'string', description: 'Optional lab_config JSON: CLIA number and certificate, waived tests, extra panels, diagnosis rules, frequency limits' },
};
const run = (a, ctx) => {
  const config = a.config ? ctx.readJson(a.config, 'lab_config') : {};
  return checkLabs(readClaims(ctx, a.claims, 'claims').claims, a.history ? ctx.records(a.history, 'history') : [], { config, facts: ctx.memoryFacts('lab_dx_rule') });
};
const sumLine = (o) => `${o.claims} lab claim(s): ${o.errors} with errors, ${o.warnings} with warnings. ${Object.entries(o.by_check).map(([k, v]) => `${k} ${v}`).join(', ') || 'No issues'}.`;
const refused = refusedTools([
  { name: 'claim_submit', category: 'binding_send', description: 'Tarragon never sends claims; the lab does, after fixing them.' },
  { name: 'result_release', category: 'binding_send', description: 'Tarragon never touches test results.' },
]);

export const manifest = defineManifest({
  name: 'tarragon-of-labs', version: pkg.version,
  description: 'Lab claims that get paid: checks the CLIA number and certificate (QW on waived tests, nothing outside a waiver), finds panel components billed one by one or beside their panel, venipuncture more than once a day, repeats without 91, diagnoses that do not support a test under your rules, and tests repeated more often than your limits. Patient identifiers are masked before results reach the model.',
  model: MODEL_PIN,
  caps: { maxSteps: 60, maxSpendUsd: 0 },
  configSchemas: { lab_config: LAB_CONFIG_SCHEMA },
  memory: { prefix: 'tarragon', kinds: MEMORY_KINDS },
  sources: {
    claims: { label: 'Lab claims (837P or claim export)', args: ['claims'], fields: CLAIM_FIELDS, profiles: [exportProfile('tebra_charges', { claim_id: 'Encounter ID', code: 'Procedure Code', date_of_service: 'Service Date', payer: 'Primary Insurance' })] },
    history: { label: 'Earlier lab tests', args: ['history'], fields: HISTORY_FIELDS },
  },
  argDocs: { ref: 'Claim id from tarragon_check', limit: 'Most claims to return (the report file always has all of them)', status: 'Only claims with this status', check: 'Only claims with an issue of this kind' },
  prompts: [{
    name: 'lab_claim_check', title: 'Check lab claims',
    description: 'Walks the host model through lab claims with Tarragon.',
    arguments: [{ name: 'claims', description: '837P or claim export', required: true }],
    text: `You are helping a lab or practice billing lead with tarragon-of-labs. Claims: {{claims}}.

Rules: Tarragon never sends claims or touches results. Patient names are pseudonyms in results. Never suggest a diagnosis to make a test pay: diagnoses come from the order.

1. Call tarragon_check. Fix CLIA, certificate and QW errors first, then panels, venipuncture and repeats.
2. For diagnosis warnings, say to check the order and, for Medicare patients, the ABN before the test.
3. Call tarragon_panels if the person asks which panels the checks know.
4. Call tarragon_write_report for the list with real names.`,
  }],
  tools: [
    { name: 'tarragon_check', kind: 'read', title: 'Check lab claims',
      description: 'Every claim with lab tests or venipuncture, its codes and diagnoses, status (error, warning, ok) and issues: clia, qw, certificate, repeat, venipuncture, panel_component, unbundled_panel, diagnosis, frequency.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['claims'], properties: { ...files, status: { type: 'string', enum: ['error', 'warning', 'ok'] }, check: { type: 'string', enum: ['clia', 'qw', 'certificate', 'repeat', 'venipuncture', 'panel_component', 'unbundled_panel', 'diagnosis', 'frequency'] }, limit: { type: 'integer', minimum: 1, maximum: 5000 } } },
      handler: async (a, ctx) => { const o = run(a, ctx); const { items, ...t } = o; let list = a.status ? items.filter((i) => i.status === a.status) : items; if (a.check) list = list.filter((i) => i.issues.some((x) => x.check === a.check)); return { summary: sumLine(o), ...t, ...page(list, a.limit || 200) }; } },
    { name: 'tarragon_explain', kind: 'read', title: 'Explain one lab claim',
      description: 'One claim with its CLIA, codes, diagnoses and each issue in plain words.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['claims', 'ref'], properties: { ...files, ref: { type: 'string' } } },
      handler: async (a, ctx) => { const o = run(a, ctx); const c = findItem(o.items, 'claim_id', a.ref, ctx, { label: 'claim' }); return { summary: `${c.claim_id}: ${c.codes} (diagnoses ${c.diagnoses || 'none'}). ${c.status}${c.issues.length ? `: ${c.issues.map((i) => i.message).join(' ')}` : ''}`, claim: c }; } },
    { name: 'tarragon_panels', kind: 'read', title: 'List the panels checked',
      description: 'The panels Tarragon checks (built-in metabolic, lipid and hepatic panels plus any in the config) with their component codes.',
      inputSchema: { type: 'object', additionalProperties: false, properties: { config: files.config } },
      handler: async (a, ctx) => { const config = a.config ? ctx.readJson(a.config, 'lab_config') : {}; const list = [...Object.entries(PANELS).map(([code, p]) => ({ code, ...p, source: 'built-in' })), ...(config.panels || []).map((p) => ({ ...p, source: 'config' }))]; return { summary: `${list.length} panel(s): ${list.map((p) => p.code).join(', ')}.`, panels: list }; } },
    reportTool({
      name: 'tarragon_write_report', title: 'Write the lab claim list', outDir: OUT, base: 'tarragon-labs',
      description: 'Write tarragon-labs.csv (one row per issue with blank owner and fixed columns) and tarragon-labs.html (with counts by check) into out_dir (default remedy-out/tarragon).',
      properties: files, required: ['claims'],
      build: (a, ctx) => {
        const o = run(a, ctx);
        const rows = o.items.flatMap((i) => (i.issues.length ? i.issues : [{ check: '', severity: 'ok', message: '' }]).map((x) => ({ status: i.status, claim_id: i.claim_id, patient_name: i.patient_name, payer: i.payer || '', date_of_service: i.date_of_service, clia: i.clia || '', codes: i.codes, diagnoses: i.diagnoses, check: x.check, severity: x.severity, message: x.message, owner: '', fixed: '' })));
        return {
          title: { en: 'Lab claim check', de: 'Prüfung der Laborabrechnungen', fr: 'Contrôle des demandes de laboratoire', es: 'Revisión de reclamaciones de laboratorio', pt: 'Verificação de cobranças de laboratório', it: 'Controllo delle richieste di laboratorio', ja: '検査請求チェック', zh: '检验索赔检查', ko: '검사 청구 점검' },
          intro: sumLine(o), rows, summary: `Lab claim list written: ${sumLine(o)}`,
          htmlColumns: ['status', 'claim_id', 'date_of_service', 'clia', 'codes', 'diagnoses', 'check', 'message'],
          sections: [{ title: sectionTitle('by_rule'), rows: Object.entries(o.by_check).map(([check, count]) => ({ check, count })), columns: ['check', 'count'] }],
          limits: [LIMITS.files, 'Waived tests, diagnosis rules and frequency limits are the ones in your config and memory; take them from the CMS waived test list and your payers\' coverage policies.', LIMITS.codes, LIMITS.phi, LIMITS.advice],
        };
      },
    }),
    ...MEMORY.tools,
    ...refused.tools,
  ],
  policy: { rules: [
    { tool: 'tarragon_check', decision: 'allow' },
    { tool: 'tarragon_explain', decision: 'allow' },
    { tool: 'tarragon_panels', decision: 'allow' },
    { tool: 'tarragon_write_report', decision: 'allow' },
    ...MEMORY.rules,
    ...refused.rules,
    { tool: '*', decision: 'block', reason: 'Not on the Tarragon allowlist.' },
  ] },
});
