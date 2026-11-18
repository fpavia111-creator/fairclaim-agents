import { defineManifest, MODEL_PIN, CLAIM_FIELDS, readClaims, refusedTools, memoryTools, reportTool, findItem, page, sectionTitle, exportProfile, LIMITS } from 'fairclaim-core';
import { readFileSync } from 'node:fs';
import { checkModifiers, CHECKS, MODIFIER_TABLE } from './logic.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const OUT = 'remedy-out/modifiers';
const CODE = { type: 'string', pattern: '^[A-Za-z0-9]{1,5}\\*?$' };
const MOD = { type: 'string', pattern: '^[A-Za-z0-9]{2}$' };
const RULE = { type: 'object', additionalProperties: false, required: ['payer', 'action', 'modifiers'], properties: { payer: { type: 'string', minLength: 1, maxLength: 120 }, action: { type: 'string', enum: ['not_accepted', 'needs_one_of'] }, modifiers: { type: 'array', minItems: 1, maxItems: 20, items: MOD }, codes: { type: 'array', maxItems: 500, items: CODE }, note: { type: 'string', maxLength: 300 } } };

const MOD_CONFIG_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    laterality_codes: { type: 'array', maxItems: 2000, items: CODE, description: 'Codes that need a side or digit modifier (RT, LT, 50, F1-F9, T1-T9 and so on)' },
    rules: { type: 'array', maxItems: 500, items: RULE },
  },
};

export const MEMORY_KINDS = Object.freeze({
  payer_modifier_rule: {
    description: 'A payer\'s modifier rule learned from a denial, e.g. {"payer": "Demo Medicaid Plan", "action": "not_accepted", "modifiers": ["59"], "note": "Use XE, XS, XP or XU"} or {"payer": "Sample Mutual Insurance", "action": "needs_one_of", "modifiers": ["RT", "LT", "50"], "codes": ["20610"]}.',
    effect: 'adds this rule to the checks for that payer. It only adds checks; it never clears an issue the built-in checks find.',
    schema: RULE,
  },
});
const MEMORY = memoryTools('modifiers', MEMORY_KINDS);

const files = {
  claims: { type: 'string', description: 'Claims under --root: an 837 file or a charge export with one row per line (code and modifiers)' },
  config: { type: 'string', description: 'Optional modifier_config JSON: codes that need a side, and payer modifier rules' },
};
const run = (a, ctx) => {
  const config = a.config ? ctx.readJson(a.config, 'modifier_config') : {};
  const claims = readClaims(ctx, a.claims, 'claims').claims;
  return { out: checkModifiers(claims, { config, facts: ctx.memoryFacts('payer_modifier_rule') }) };
};
const sumLine = (o) => `${o.claims} claim(s), ${o.lines} line(s): ${o.clean_claims} clean; ${o.errors} error(s), ${o.warnings} warning(s). ${Object.entries(o.by_check).map(([k, v]) => `${k} ${v}`).join(', ') || 'No issues'}.`;
const refused = refusedTools([
  { name: 'modifier_append', category: 'binding_send', description: 'Fairclaim Modifier Checks never adds or removes modifiers; a coder decides from the note.' },
  { name: 'claim_submit', category: 'binding_send', description: 'Fairclaim Modifier Checks never submits claims.' },
]);

export const manifest = defineManifest({
  name: 'fairclaim-modifier-checks', version: pkg.version,
  description: 'Checks the modifiers on each claim line before it goes out: missing 25 on an E/M with a procedure, 25 or 57 on the wrong code, conflicting pairs, 59 with X modifiers, missing laterality, bilateral units, repeat modifiers with no first service, payment modifiers out of order, too many modifiers, and payer rules. Patient identifiers are masked before results reach the model.',
  model: MODEL_PIN,
  caps: { maxSteps: 60, maxSpendUsd: 0 },
  configSchemas: { modifier_config: MOD_CONFIG_SCHEMA },
  memory: { prefix: 'modifiers', kinds: MEMORY_KINDS },
  sources: { claims: { label: 'Claims (837 or charge export)', args: ['claims'], fields: CLAIM_FIELDS, profiles: [exportProfile('tebra_charges', { claim_id: 'Encounter ID', code: 'Procedure Code', date_of_service: 'Service Date', payer: 'Primary Insurance' }), exportProfile('advancedmd_charges', { claim_id: 'Visit ID', code: 'Proc Code', date_of_service: 'Date of Service', payer: 'Primary Carrier' })] } },
  argDocs: { claim_id: 'Claim number from modifiers_check; a pseudonym in strict masking mode', modifier: 'Two-character modifier, for example 25 or XS', limit: 'Most issues to return (the report file always has all of them)', check: 'Only issues from this check', severity: 'Only errors or only warnings' },
  prompts: [{
    name: 'modifier_review', title: 'Check modifiers before submission',
    description: 'Walks the host model through modifier checks with Fairclaim Modifier Checks.',
    arguments: [{ name: 'claims', description: '837 or charge export', required: true }],
    text: `You are helping a coder with fairclaim-modifier-checks. Claims: {{claims}}.

Rules: Fairclaim Modifier Checks never changes modifiers or submits claims. A modifier is only right when the note supports it: never tell anyone to add 25 or 59 just to get paid.

1. Call modifiers_check. Report errors first by check.
2. For em_needs_25, say the coder must read the note: add 25 only if the E/M was significant and separately identifiable.
3. If a payer denied a modifier, offer modifiers_learn (kind payer_modifier_rule).
4. Call modifiers_write_report for the coder's list.`,
  }],
  tools: [
    { name: 'modifiers_check', kind: 'read', title: 'Check modifiers',
      description: 'One row per issue: claim, line, code, modifiers, check, severity, message and fix. Checks: ' + Object.keys(CHECKS).join(', ') + '.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['claims'], properties: { ...files, check: { type: 'string', enum: Object.keys(CHECKS) }, severity: { type: 'string', enum: ['error', 'warning'] }, limit: { type: 'integer', minimum: 1, maximum: 5000 } } },
      handler: async (a, ctx) => { const { out } = run(a, ctx); const { issues, ...t } = out; return { summary: sumLine(out), ...t, ...page(issues.filter((i) => (!a.check || i.check === a.check) && (!a.severity || i.severity === a.severity)), a.limit || 200) }; } },
    { name: 'modifiers_modifier', kind: 'read', title: 'Look up a modifier',
      description: 'What a modifier means in Fairclaim Modifier Checks\'s short table (paraphrased, not the official descriptor) and whether it changes payment or is informational.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['modifier'], properties: { modifier: { type: 'string', minLength: 2, maxLength: 2 } } },
      handler: async (a) => { const m = String(a.modifier).toUpperCase(); const t = MODIFIER_TABLE[m]; return { summary: t ? `${m}: ${t[1]} (${t[0] === 'pricing' ? 'changes payment' : 'informational'}).` : `${m} is not in Fairclaim Modifier Checks's short table: check the current CPT and HCPCS lists.`, modifier: m, known: Boolean(t), kind: t ? t[0] : null, meaning: t ? t[1] : null }; } },
    { name: 'modifiers_explain', kind: 'read', title: 'Explain one claim',
      description: 'All modifier issues on one claim with the fixes.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['claims', 'claim_id'], properties: { ...files, claim_id: { type: 'string' } } },
      handler: async (a, ctx) => { const { out } = run(a, ctx); const hit = out.issues.find((i) => (ctx.phi ? ctx.phi.same(i.claim_id, a.claim_id, 'claim') : i.claim_id === a.claim_id)); if (!hit) return { summary: `No modifier issues on ${a.claim_id} (or no such claim).`, issues: [] }; const list = out.issues.filter((i) => i.claim_id === hit.claim_id); return { summary: `${hit.claim_id}: ${list.length} issue(s). ${list.map((i) => `line ${i.line ?? '-'} ${i.check}: ${i.message}`).join(' ')}`, issues: list }; } },
    reportTool({
      name: 'modifiers_write_report', title: 'Write the modifier work list', outDir: OUT, base: 'modifiers',
      description: 'Write modifiers.csv (one row per issue with blank coder and decision columns) and modifiers.html into out_dir (default remedy-out/modifiers).',
      properties: files, required: ['claims'],
      build: (a, ctx) => {
        const { out } = run(a, ctx);
        const rows = out.issues.map((i) => ({ severity: i.severity, check: i.check, claim_id: i.claim_id, patient_name: i.patient_name, payer: i.payer, line: i.line ?? '', code: i.code || '', modifier: i.modifiers, message: i.message, fix: i.fix, owner: '', decision: '' }));
        return {
          title: { en: 'Modifier work list', de: 'Arbeitsliste Modifikatoren', fr: 'Liste de travail des modificateurs', es: 'Lista de trabajo de modificadores', pt: 'Lista de trabalho de modificadores', it: 'Elenco di lavoro dei modificatori', ja: 'モディファイア作業リスト', zh: '修饰符工作清单', ko: '수정자 작업 목록' },
          intro: sumLine(out), rows, summary: `Modifier work list written: ${sumLine(out)}`,
          htmlColumns: ['severity', 'check', 'claim_id', 'line', 'code', 'modifier', 'message', 'fix'],
          sections: [{ title: sectionTitle('by_rule'), rows: Object.entries(out.by_check).map(([k, v]) => ({ check: k, count: v })), columns: ['check', 'count'] }],
          limits: [LIMITS.files, LIMITS.codes, 'A modifier is right only when the clinical note supports it. Fairclaim Modifier Checks finds lines to look at; it does not decide.', LIMITS.advice],
        };
      },
    }),
    ...MEMORY.tools,
    ...refused.tools,
  ],
  policy: { rules: [
    { tool: 'modifiers_check', decision: 'allow' },
    { tool: 'modifiers_modifier', decision: 'allow' },
    { tool: 'modifiers_explain', decision: 'allow' },
    { tool: 'modifiers_write_report', decision: 'allow' },
    ...MEMORY.rules,
    ...refused.rules,
    { tool: '*', decision: 'block', reason: 'Not on the Fairclaim Modifier Checks allowlist.' },
  ] },
});
