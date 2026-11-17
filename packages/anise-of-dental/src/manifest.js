import { defineManifest, MODEL_PIN, CLAIM_FIELDS, readClaims, refusedTools, memoryTools, reportTool, findItem, page, sectionTitle, exportProfile, LIMITS } from 'remedy-core';
import { readFileSync } from 'node:fs';
import { checkDental, DEFAULT_FREQUENCY } from './logic.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const OUT = 'remedy-out/anise';
const CDT = { type: 'string', pattern: '^D\\d{3}[\\d*]$' };

export const HISTORY_FIELDS = Object.freeze({
  patient_name: { aliases: ['Patient', 'Patient Name'] },
  member_id: { aliases: ['Member ID', 'Subscriber ID', 'Insurance ID'], translate: false },
  patient_dob: { aliases: ['DOB', 'Birth Date', 'Date of Birth', 'Birthdate'], type: 'date', translate: false },
  date_of_service: { aliases: ['Date', 'Date of Service', 'DOS', 'Service Date', 'ProcDate'], type: 'date', required: true, translate: false },
  code: { aliases: ['Code', 'CDT', 'CDT Code', 'Procedure Code', 'ProcCode', 'Proc Code'], required: true, translate: false },
  tooth: { aliases: ['Tooth', 'Tooth Number', 'Tooth #', 'ToothNum', 'Th'], translate: false },
  quadrant: { aliases: ['Quadrant', 'Area of Oral Cavity', 'Quad'], translate: false },
});

const RULE = { type: 'object', additionalProperties: false, required: ['codes', 'max'], properties: {
  label: { type: 'string', maxLength: 80 }, codes: { type: 'array', minItems: 1, maxItems: 40, items: CDT }, max: { type: 'integer', minimum: 1, maximum: 20 },
  calendar_year: { type: 'boolean' }, months: { type: 'integer', minimum: 1, maximum: 120 }, per: { type: 'string', enum: ['patient', 'tooth', 'quadrant'] },
  age_max: { type: 'integer', minimum: 1, maximum: 120 }, payer: { type: 'string', maxLength: 120 }, note: { type: 'string', maxLength: 300 },
} };
const DENTAL_CONFIG_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    frequency: { type: 'array', maxItems: 200, items: { ...RULE, required: ['codes', 'max', 'per'] }, description: 'Frequency limits; replaces the built-in common limits when given' },
    attachments: { type: 'array', maxItems: 100, items: { type: 'object', additionalProperties: false, required: ['codes', 'need'], properties: { codes: { type: 'array', minItems: 1, maxItems: 40, items: CDT }, need: { type: 'string', minLength: 1, maxLength: 200 } } }, description: 'What payers ask to see with some codes' },
    primary_tooth_age: { type: 'integer', minimum: 6, maximum: 30, description: 'Warn about a primary (lettered) tooth from this age (default 14)' },
  },
};

export const MEMORY_KINDS = Object.freeze({
  payer_frequency: {
    description: 'A frequency limit one payer applies, learned from a denial, e.g. {"payer": "Example Dental Plan", "label": "Bitewings", "codes": ["D0274"], "max": 1, "months": 24, "per": "patient"}.',
    effect: 'adds a frequency warning for that payer\'s claims. It only adds a check; it never removes a built-in or config limit.',
    schema: { ...RULE, required: ['payer', 'codes', 'max', 'per'] },
  },
});
const MEMORY = memoryTools('anise', MEMORY_KINDS);

const files = {
  claims: { type: 'string', description: 'Dental claims under --root: an 837D file or a procedure export with claim id, date, CDT code, tooth, surfaces and quadrant' },
  history: { type: 'string', description: 'Optional past procedures under --root (patient or member id, date, code, tooth, quadrant) for frequency limits and extracted teeth' },
  config: { type: 'string', description: 'Optional dental_config JSON: frequency limits, attachments payers ask for, primary-tooth age' },
};
const run = (a, ctx) => {
  const config = a.config ? ctx.readJson(a.config, 'dental_config') : {};
  const claims = readClaims(ctx, a.claims, 'claims').claims;
  const history = a.history ? ctx.records(a.history, 'history') : [];
  return checkDental(claims, history, { config, facts: ctx.memoryFacts('payer_frequency') });
};
const sumLine = (o) => `${o.claims} claim(s), ${o.lines} line(s): ${o.errors} with errors, ${o.warnings} with warnings, ${o.attach} needing attachments. ${Object.entries(o.by_check).map(([k, v]) => `${k} ${v}`).join(', ') || 'No issues'}.`;
const refused = refusedTools([
  { name: 'claim_submit', category: 'binding_send', description: 'Anise never sends claims; the practice does, after fixing them.' },
  { name: 'chart_update', category: 'binding_send', description: 'Anise never changes the clinical chart or tooth numbers.' },
]);

export const manifest = defineManifest({
  name: 'anise-of-dental', version: pkg.version,
  description: 'Dental claims that go out right: checks CDT codes, Universal tooth numbers, surfaces against the restoration code, anterior and posterior codes, root canal codes against the tooth, quadrants for scaling and root planing, frequency limits against the patient\'s history, extracted teeth, duplicates, and the attachments payers ask for, from an 837D or a practice export. Patient identifiers are masked before results reach the model.',
  model: MODEL_PIN,
  caps: { maxSteps: 60, maxSpendUsd: 0 },
  configSchemas: { dental_config: DENTAL_CONFIG_SCHEMA },
  memory: { prefix: 'anise', kinds: MEMORY_KINDS },
  sources: {
    claims: { label: 'Dental claims (837D or procedure export)', args: ['claims'], fields: CLAIM_FIELDS, profiles: [exportProfile('open_dental_procedures', { claim_id: 'ClaimNum', date_of_service: 'ProcDate', code: 'ProcCode', tooth: 'ToothNum', surfaces: 'Surf', charge: 'ProcFee', patient_dob: 'Birthdate' })] },
    history: { label: 'Procedure history', args: ['history'], fields: HISTORY_FIELDS },
  },
  argDocs: { ref: 'Claim id from anise_check', limit: 'Most lines to return (the report file always has all of them)', status: 'Only lines with this status', check: 'Only lines with an issue of this kind' },
  prompts: [{
    name: 'dental_claim_check', title: 'Check dental claims before sending',
    description: 'Walks the host model through a dental claim check with Anise.',
    arguments: [{ name: 'claims', description: '837D or procedure export', required: true }, { name: 'history', description: 'past procedures', required: false }],
    text: `You are helping a dental billing coordinator with anise-of-dental. Claims: {{claims}}. History: {{history}}.

Rules: Anise never sends claims or changes the chart. Patient names are pseudonyms in results. Frequency limits are common plan limits unless the config or memory says otherwise; never tell anyone a plan will or will not pay.

1. Call anise_check. Fix errors first: tooth, surfaces, code family, quadrant, extracted teeth, duplicates.
2. For frequency warnings, say to check the patient's benefits before the visit or before sending.
3. List the attachments each claim needs.
4. If a payer denies for frequency in a way the rules missed, offer anise_learn (kind payer_frequency).
5. Call anise_write_report for the list with real names.`,
  }],
  tools: [
    { name: 'anise_check', kind: 'read', title: 'Check dental claim lines',
      description: 'Every line with its status (error, warning, attach, ok) and issues: code, tooth, surfaces, tooth_type, quadrant, extracted, duplicate, same_day, frequency, age, attachment.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['claims'], properties: { ...files, status: { type: 'string', enum: ['error', 'warning', 'attach', 'ok'] }, check: { type: 'string', enum: ['code', 'tooth', 'surfaces', 'tooth_type', 'quadrant', 'extracted', 'duplicate', 'same_day', 'frequency', 'age', 'attachment'] }, limit: { type: 'integer', minimum: 1, maximum: 5000 } } },
      handler: async (a, ctx) => { const o = run(a, ctx); const { items, ...t } = o; let list = a.status ? items.filter((i) => i.status === a.status) : items; if (a.check) list = list.filter((i) => i.issues.some((x) => x.check === a.check)); return { summary: sumLine(o), ...t, ...page(list, a.limit || 200) }; } },
    { name: 'anise_explain', kind: 'read', title: 'Explain one dental claim',
      description: 'Every line of one claim with its tooth, surfaces, quadrant and each issue in plain words.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['claims', 'ref'], properties: { ...files, ref: { type: 'string' } } },
      handler: async (a, ctx) => { const o = run(a, ctx); const hit = findItem(o.items, 'claim_id', a.ref, ctx, { label: 'claim' }); const lines = o.items.filter((i) => i.claim_id === hit.claim_id).sort((x, y) => x.line - y.line); return { summary: `${hit.claim_id}: ${lines.map((l) => `${l.code}${l.tooth ? ` #${l.tooth}` : ''}${l.surfaces ? ` ${l.surfaces}` : ''} ${l.status}${l.issues.length ? ` (${l.issues.map((i) => i.message).join(' ')})` : ''}`).join('; ')}`, lines }; } },
    { name: 'anise_frequency_rules', kind: 'read', title: 'Show the frequency limits in use',
      description: 'The frequency limits Anise checks: from the config, else the built-in common limits, plus learned payer limits.',
      inputSchema: { type: 'object', additionalProperties: false, properties: { config: files.config } },
      handler: async (a, ctx) => { const config = a.config ? ctx.readJson(a.config, 'dental_config') : {}; const mem = ctx.memoryFacts('payer_frequency'); return { summary: `${(config.frequency || DEFAULT_FREQUENCY).length} limit(s) from ${config.frequency ? 'your config' : 'the built-in common limits (not any plan\'s rules)'}, plus ${mem.length} learned payer limit(s).`, rules: config.frequency || DEFAULT_FREQUENCY, learned: mem.map((f) => ({ fact_id: f.id, ...f.value })) }; } },
    reportTool({
      name: 'anise_write_report', title: 'Write the dental claim list', outDir: OUT, base: 'anise-dental',
      description: 'Write anise-dental.csv (one row per issue with blank owner and fixed columns) and anise-dental.html (with counts by check) into out_dir (default remedy-out/anise).',
      properties: files, required: ['claims'],
      build: (a, ctx) => {
        const o = run(a, ctx);
        const rows = o.items.flatMap((i) => (i.issues.length ? i.issues : [{ check: '', severity: 'ok', message: '' }]).map((x) => ({ status: i.status, claim_id: i.claim_id, line: i.line, patient_name: i.patient_name, payer: i.payer || '', date_of_service: i.date_of_service, code: i.code, tooth: i.tooth || '', surfaces: i.surfaces, quadrant: i.quadrant || '', check: x.check, severity: x.severity, message: x.message, owner: '', fixed: '' })));
        return {
          title: { en: 'Dental claim check', de: 'Prüfung zahnärztlicher Abrechnungen', fr: 'Contrôle des demandes dentaires', es: 'Revisión de reclamaciones dentales', pt: 'Verificação de guias odontológicas', it: 'Controllo delle richieste odontoiatriche', ja: '歯科請求チェック', zh: '牙科索赔检查', ko: '치과 청구 점검' },
          intro: sumLine(o), rows, summary: `Dental claim list written: ${sumLine(o)}`,
          htmlColumns: ['status', 'claim_id', 'date_of_service', 'code', 'tooth', 'surfaces', 'quadrant', 'check', 'message'],
          sections: [{ title: sectionTitle('by_rule'), rows: Object.entries(o.by_check).map(([check, count]) => ({ check, count })), columns: ['check', 'count'] }],
          limits: [LIMITS.files, 'Frequency limits are your config or common limits, not the patient\'s plan; check benefits before treatment.', 'CDT codes and descriptors are the American Dental Association\'s; Anise checks structure, not clinical need.', LIMITS.phi, LIMITS.advice],
        };
      },
    }),
    ...MEMORY.tools,
    ...refused.tools,
  ],
  policy: { rules: [
    { tool: 'anise_check', decision: 'allow' },
    { tool: 'anise_explain', decision: 'allow' },
    { tool: 'anise_frequency_rules', decision: 'allow' },
    { tool: 'anise_write_report', decision: 'allow' },
    ...MEMORY.rules,
    ...refused.rules,
    { tool: '*', decision: 'block', reason: 'Not on the Anise allowlist.' },
  ] },
});
