import { defineManifest, MODEL_PIN, refusedTools, memoryTools, reportTool, findItem, page, sectionTitle, LIMITS, today } from 'remedy-core';
import { readFileSync } from 'node:fs';
import { checkRegistrations, CHECKS, safePattern } from './logic.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const OUT = 'remedy-out/marjoram';

export const REG_FIELDS = Object.freeze({
  mrn: { aliases: ['MRN', 'Chart Number', 'Chart #', 'Patient ID', 'Medical Record Number', 'Patient Number', 'Account Number'], required: true, phi: 'mrn', translate: false },
  patient_name: { aliases: ['Patient', 'Patient Name', 'Name', 'Pt Name'], phi: 'name' },
  first_name: { aliases: ['First Name', 'Patient First Name', 'First'], phi: 'name' },
  last_name: { aliases: ['Last Name', 'Patient Last Name', 'Last'], phi: 'name' },
  dob: { aliases: ['DOB', 'Date of Birth', 'Birth Date', 'Birthdate', 'Patient DOB'], type: 'date', phi: 'dob' },
  gender: { aliases: ['Gender', 'Sex'], translate: false },
  address: { aliases: ['Address', 'Street', 'Address 1', 'Address Line 1', 'Street Address'], phi: 'address' },
  city: { aliases: ['City', 'Town'] },
  state: { aliases: ['State', 'ST', 'Province'], translate: false },
  zip: { aliases: ['ZIP', 'Zip Code', 'Postal Code', 'Zip'], phi: 'zip', translate: false },
  phone: { aliases: ['Phone', 'Home Phone', 'Mobile', 'Cell Phone', 'Phone Number', 'Primary Phone'], phi: 'phone', translate: false },
  payer: { aliases: ['Primary Insurance', 'Insurance', 'Payer', 'Primary Payer', 'Insurance Name', 'Carrier', 'Plan'] },
  member_id: { aliases: ['Member ID', 'Subscriber ID', 'Insurance ID', 'Policy Number', 'Policy #', 'Primary Member ID', 'Ins ID'], phi: 'member_id', translate: false },
  group_number: { aliases: ['Group Number', 'Group #', 'Group ID', 'Group'], translate: false },
  relationship: { aliases: ['Relationship', 'Relationship to Subscriber', 'Patient Relationship', 'Rel to Insured', 'Relation'] },
  subscriber_name: { aliases: ['Subscriber', 'Subscriber Name', 'Insured Name', 'Policy Holder', 'Policyholder'], phi: 'name' },
  subscriber_dob: { aliases: ['Subscriber DOB', 'Insured DOB', 'Policy Holder DOB', 'Subscriber Date of Birth'], type: 'date', phi: 'dob' },
  coverage_start: { aliases: ['Effective Date', 'Coverage Start', 'Eff Date', 'Start Date'], type: 'date', translate: false },
  coverage_end: { aliases: ['Termination Date', 'Coverage End', 'Term Date', 'End Date', 'Expiration Date'], type: 'date', translate: false },
  secondary_payer: { aliases: ['Secondary Insurance', 'Secondary Payer', 'Secondary Carrier'] },
  secondary_member_id: { aliases: ['Secondary Member ID', 'Secondary Subscriber ID', 'Secondary Policy Number'], phi: 'member_id', translate: false },
  guarantor: { aliases: ['Guarantor', 'Guarantor Name', 'Responsible Party', 'Parent/Guardian'], phi: 'name' },
  verified: { aliases: ['Last Verified', 'Insurance Verified', 'Verified Date', 'Eligibility Checked', 'Card Scanned'], type: 'date', translate: false },
});

const REG_CONFIG_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    payers: { type: 'array', maxItems: 500, items: { type: 'object', additionalProperties: false, required: ['name'], properties: { name: { type: 'string', minLength: 1 }, member_id_pattern: { type: 'string', minLength: 1, maxLength: 80 }, id_format: { type: 'string', enum: ['mbi'] } } } },
    verify_days: { type: 'integer', minimum: 1, maximum: 1095, description: 'Flag insurance not verified within this many days (default 365)' },
    minor_age: { type: 'integer', minimum: 1, maximum: 26, description: 'Age under which a guarantor is required (default 18)' },
  },
};

export const MEMORY_KINDS = Object.freeze({
  payer_member_id_pattern: {
    description: 'The shape of one payer\'s member ids, learned from a rejection, e.g. {"payer": "Demo Medicaid Plan", "pattern": "DMP\\\\d{9}", "note": "9 digits after the prefix"}.',
    effect: 'checks member ids for that payer against the pattern too. It only adds a check; it never passes an id the config would flag.',
    schema: { type: 'object', additionalProperties: false, required: ['payer', 'pattern'], properties: { payer: { type: 'string', minLength: 1, maxLength: 120 }, pattern: { type: 'string', minLength: 1, maxLength: 80 }, note: { type: 'string', maxLength: 300 } } },
    check: (v) => { try { safePattern(v.pattern); return null; } catch (e) { return e.message; } },
  },
});
const MEMORY = memoryTools('marjoram', MEMORY_KINDS);

const files = {
  patients: { type: 'string', description: 'Patient registration export under --root (CSV, Excel, JSON): one row per patient with chart number, name, birth date, address, insurance, member id, subscriber and guarantor' },
  config: { type: 'string', description: 'Optional registration_config JSON: member id pattern or MBI format per payer, verification age, guarantor age' },
  as_of: { type: 'string', format: 'date', description: 'Date to check against (YYYY-MM-DD, default today)' },
};
const run = (a, ctx) => {
  const config = a.config ? ctx.readJson(a.config, 'registration_config') : {};
  for (const p of config.payers || []) if (p.member_id_pattern) safePattern(p.member_id_pattern);
  return { out: checkRegistrations(ctx.records(a.patients, 'patients'), { config, facts: ctx.memoryFacts('payer_member_id_pattern'), asOf: a.as_of || today() }) };
};
const sumLine = (o) => `${o.patients} patient(s): ${o.clean} clean, ${o.with_errors} with errors (${o.errors} error(s), ${o.warnings} warning(s)). ${Object.entries(o.by_check).map(([k, v]) => `${k} ${v}`).join(', ') || 'No issues'}.${o.duplicate_pairs ? ` ${o.duplicate_pairs} likely duplicate pair(s).` : ''}`;
const refused = refusedTools([
  { name: 'patient_merge', category: 'delete_personal_data', description: 'Marjoram never merges or deletes charts; a person checks the records and merges in the practice system.' },
  { name: 'registration_update', category: 'binding_send', description: 'Marjoram never changes registration data; the front desk corrects it with the patient.' },
]);

export const manifest = defineManifest({
  name: 'marjoram-of-registration', version: pkg.version,
  description: 'Checks patient registration and insurance records before the visit: member id shape per payer and Medicare MBI format, missing or impossible birth dates, subscriber and guarantor gaps, ended coverage, the same plan entered twice, contact formats, and likely duplicate charts. Patient identifiers are masked before results reach the model.',
  model: MODEL_PIN,
  caps: { maxSteps: 60, maxSpendUsd: 0 },
  configSchemas: { registration_config: REG_CONFIG_SCHEMA },
  memory: { prefix: 'marjoram', kinds: MEMORY_KINDS },
  sources: { patients: { label: 'Patient registrations', args: ['patients'], fields: REG_FIELDS } },
  argDocs: { mrn: 'Chart number from marjoram_check (the MRN- pseudonym works too)', limit: 'Most issues to return (the report file always has all of them)', check: 'Only issues from this check', severity: 'Only errors or only warnings' },
  prompts: [{
    name: 'registration_cleanup', title: 'Clean up registrations before visits',
    description: 'Walks the host model through registration checks with Marjoram.',
    arguments: [{ name: 'patients', description: 'registration export', required: true }],
    text: `You are helping a front-desk lead with marjoram-of-registration. Patients: {{patients}}.

Rules: Marjoram never changes or merges charts. Names, birth dates, member ids and chart numbers are pseudonyms in results: never ask for the real values in chat.

1. Call marjoram_check. Report errors first: they cause rejections and denials.
2. For possible_duplicate, say a person must compare the charts before any merge.
3. If a payer keeps rejecting ids of one shape, offer marjoram_learn (kind payer_member_id_pattern).
4. Call marjoram_write_report so the front desk has the list with real names.`,
  }],
  tools: [
    { name: 'marjoram_check', kind: 'read', title: 'Check registrations',
      description: 'One row per issue with the chart, check, severity, field, message and fix. Checks: ' + Object.keys(CHECKS).join(', ') + '.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['patients'], properties: { ...files, check: { type: 'string', enum: Object.keys(CHECKS) }, severity: { type: 'string', enum: ['error', 'warning'] }, limit: { type: 'integer', minimum: 1, maximum: 5000 } } },
      handler: async (a, ctx) => { const { out } = run(a, ctx); const { issues, ...t } = out; return { summary: sumLine(out), ...t, ...page(issues.filter((i) => (!a.check || i.check === a.check) && (!a.severity || i.severity === a.severity)), a.limit || 200) }; } },
    { name: 'marjoram_explain', kind: 'read', title: 'Explain one chart',
      description: 'All issues for one chart with the fixes.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['patients', 'mrn'], properties: { ...files, mrn: { type: 'string' } } },
      handler: async (a, ctx) => { const { out } = run(a, ctx); const hit = findItem(out.issues, 'mrn', a.mrn, ctx, { kind: 'mrn', label: 'chart with issues' }); const list = out.issues.filter((i) => i.mrn === hit.mrn); return { summary: `${hit.mrn}: ${list.length} issue(s). ${list.map((i) => `${i.check}: ${i.message}`).join(' ')}`, issues: list }; } },
    reportTool({
      name: 'marjoram_write_report', title: 'Write the registration fix list', outDir: OUT, base: 'marjoram-registration',
      description: 'Write marjoram-registration.csv (one row per issue with blank owner and done columns) and marjoram-registration.html into out_dir (default remedy-out/marjoram).',
      properties: files, required: ['patients'],
      build: (a, ctx) => {
        const { out } = run(a, ctx);
        const rows = out.issues.map((i) => ({ severity: i.severity, check: i.check, mrn: i.mrn, patient_name: i.patient_name, field: i.field, message: i.message, fix: i.fix, owner: '', done: '' }));
        return {
          title: { en: 'Registration fix list', de: 'Korrekturliste Patientenaufnahme', fr: 'Corrections des dossiers d\'admission', es: 'Correcciones de registro de pacientes', pt: 'Correções de cadastro de pacientes', it: 'Correzioni anagrafiche pazienti', ja: '患者登録の修正リスト', zh: '患者登记修正清单', ko: '환자 등록 수정 목록' },
          intro: sumLine(out), rows, summary: `Registration fix list written: ${sumLine(out)}`,
          htmlColumns: ['severity', 'check', 'mrn', 'field', 'message', 'fix'],
          sections: [{ title: sectionTitle('by_rule'), rows: Object.entries(out.by_check).map(([k, v]) => ({ check: k, count: v })), columns: ['check', 'count'] }],
          limits: [LIMITS.files, 'Member id shapes are the ones in your config and memory; only the payer can say an id is active. The MBI check is format only.', LIMITS.phi, LIMITS.advice],
        };
      },
    }),
    ...MEMORY.tools,
    ...refused.tools,
  ],
  policy: { rules: [
    { tool: 'marjoram_check', decision: 'allow' },
    { tool: 'marjoram_explain', decision: 'allow' },
    { tool: 'marjoram_write_report', decision: 'allow' },
    ...MEMORY.rules,
    ...refused.rules,
    { tool: '*', decision: 'block', reason: 'Not on the Marjoram allowlist.' },
  ] },
});
