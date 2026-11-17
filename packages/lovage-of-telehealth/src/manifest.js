import { defineManifest, MODEL_PIN, CLAIM_FIELDS, refusedTools, memoryTools, reportTool, findItem, page, sectionTitle, LIMITS } from 'remedy-core';
import { readFileSync } from 'node:fs';
import { checkTelehealth, DEFAULT_RULE } from './logic.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const OUT = 'remedy-out/lovage';
const POS = { type: 'string', pattern: '^\\d{2}$' };
const MOD = { type: 'string', pattern: '^[A-Za-z0-9]{2}$' };

export const TELE_FIELDS = Object.freeze({
  ...CLAIM_FIELDS,
  patient_state: { aliases: ['Patient State', 'Patient Location State', 'State of Patient', 'Pt State'], translate: false },
  patient_location: { aliases: ['Patient Location', 'Patient Site', 'Originating Site', 'Location of Patient'] },
  modality: { aliases: ['Modality', 'Visit Modality', 'Telehealth Type', 'Audio/Video', 'Connection'] },
  consent: { aliases: ['Consent', 'Consent on File', 'Telehealth Consent', 'Consent Documented'], type: 'bool' },
});

const RULE_PROPS = {
  pos: { type: 'array', minItems: 1, maxItems: 5, items: POS, description: 'Places of service this payer wants on telehealth lines (e.g. ["02","10"], or ["11"] with modifier 95)' },
  modifier: { type: 'string', enum: ['95', 'GT', 'GQ'], description: 'Telehealth modifier this payer wants on every telehealth line' },
  audio_modifier: { type: 'string', enum: ['93', 'FQ', 'FR'], description: 'Modifier for audio-only visits' },
  audio_allowed: { type: 'boolean', description: 'Whether audio-only visits are covered' },
  telemedicine_codes: { type: 'boolean', description: 'Whether the payer takes CPT 98000-98015' },
};
const TELE_CONFIG_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    default_rule: { type: 'object', additionalProperties: false, properties: RULE_PROPS, description: 'Rule for payers not listed (default: POS 02 or 10, audio-only 93, no 98000-98015)' },
    payers: { type: 'array', maxItems: 300, items: { type: 'object', additionalProperties: false, required: ['name'], properties: { name: { type: 'string', minLength: 1 }, ...RULE_PROPS, note: { type: 'string', maxLength: 300 } } }, description: 'Each payer\'s telehealth rule, from its current policy' },
    providers: { type: 'array', maxItems: 2000, items: { type: 'object', additionalProperties: false, required: ['name', 'states'], properties: { name: { type: 'string', minLength: 1 }, states: { type: 'array', minItems: 1, maxItems: 60, items: { type: 'string', pattern: '^[A-Za-z]{2}$' } } } }, description: 'States each provider is licensed in' },
  },
};

export const MEMORY_KINDS = Object.freeze({
  payer_telehealth_rule: {
    description: 'A telehealth requirement learned from a payer denial, e.g. {"payer": "Sample Mutual Insurance", "modifier": "95", "note": "Denied without 95 even with POS 10 (fictional)"}.',
    effect: 'adds that requirement for the payer: a modifier, an audio-only modifier, no audio-only, or fewer accepted places of service. It never loosens a rule.',
    schema: { type: 'object', additionalProperties: false, required: ['payer'], properties: { payer: { type: 'string', minLength: 1, maxLength: 120 }, modifier: RULE_PROPS.modifier, audio_modifier: RULE_PROPS.audio_modifier, audio_allowed: { type: 'boolean', enum: [false], description: 'Only false: memory can stop audio-only, never allow it' }, pos: RULE_PROPS.pos, note: { type: 'string', maxLength: 300 } } },
  },
});
const MEMORY = memoryTools('lovage', MEMORY_KINDS);

const files = {
  visits: { type: 'string', description: 'Telehealth claim lines under --root: claim id, patient, payer, provider, date, code, modifiers, place of service, and where possible patient state, patient location, modality (video or audio) and consent' },
  config: { type: 'string', description: 'Optional telehealth_config JSON: each payer\'s telehealth rule and each provider\'s licensed states' },
};
const run = (a, ctx) => checkTelehealth(ctx.records(a.visits, 'visits'), { config: a.config ? ctx.readJson(a.config, 'telehealth_config') : {}, facts: ctx.memoryFacts('payer_telehealth_rule') });
const sumLine = (o) => `${o.telehealth_lines} telehealth line(s) of ${o.lines_checked}: ${o.errors} with errors, ${o.warnings} with warnings. ${Object.entries(o.by_check).map(([k, v]) => `${k} ${v}`).join(', ') || 'No issues'}.`;
const refused = refusedTools([
  { name: 'claim_submit', category: 'binding_send', description: 'Lovage never sends claims; the practice does, after fixing them.' },
  { name: 'visit_start', category: 'binding_send', description: 'Lovage never starts or joins patient visits.' },
]);

export const manifest = defineManifest({
  name: 'lovage-of-telehealth', version: pkg.version,
  description: 'Telehealth claims coded the way each payer wants: checks place of service 02 or 10 against where the patient was, the 95, GT, 93 or FQ modifiers by payer, audio-only against video codes and the 98000-98015 telemedicine codes, the deleted 99441-99443, the provider\'s license in the patient\'s state, consent for virtual check-ins, and same-day in-person visits. Payer rules come from your config; the built-in rule is an example. Patient identifiers are masked before results reach the model.',
  model: MODEL_PIN,
  caps: { maxSteps: 60, maxSpendUsd: 0 },
  configSchemas: { telehealth_config: TELE_CONFIG_SCHEMA },
  memory: { prefix: 'lovage', kinds: MEMORY_KINDS },
  sources: { visits: { label: 'Telehealth claim lines', args: ['visits'], fields: TELE_FIELDS } },
  argDocs: { ref: 'Claim id from lovage_check', limit: 'Most lines to return (the report file always has all of them)', status: 'Only lines with this status', check: 'Only lines with an issue of this kind' },
  prompts: [{
    name: 'telehealth_check', title: 'Check telehealth claims',
    description: 'Walks the host model through telehealth claims with Lovage.',
    arguments: [{ name: 'visits', description: 'telehealth claim lines', required: true }],
    text: `You are helping a practice billing lead with lovage-of-telehealth. Visits: {{visits}}.

Rules: Lovage never sends claims. Patient names are pseudonyms in results. Payer telehealth rules change often: the config holds the practice's current reading; the built-in rule is only an example. Never state a payer's policy from memory.

1. Call lovage_check. Fix place of service, modifiers and deleted codes first, then licensing.
2. Say which rule each line was checked against (your rule or the example rule); suggest adding missing payers to the config.
3. If a payer denied for a rule the config missed, offer lovage_learn (kind payer_telehealth_rule).
4. Call lovage_write_report for the list with real names.`,
  }],
  tools: [
    { name: 'lovage_check', kind: 'read', title: 'Check telehealth claim lines',
      description: 'Every telehealth line with the rule it was checked against, status (error, warning, ok) and issues: deleted_code, modality, payer_code, audio_only, pos, modifier, consent, originating_site, license, same_day.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['visits'], properties: { ...files, status: { type: 'string', enum: ['error', 'warning', 'ok'] }, check: { type: 'string', enum: ['deleted_code', 'modality', 'payer_code', 'audio_only', 'pos', 'modifier', 'consent', 'originating_site', 'license', 'same_day'] }, limit: { type: 'integer', minimum: 1, maximum: 5000 } } },
      handler: async (a, ctx) => { const o = run(a, ctx); const { items, ...t } = o; let list = a.status ? items.filter((i) => i.status === a.status) : items; if (a.check) list = list.filter((i) => i.issues.some((x) => x.check === a.check)); return { summary: sumLine(o), ...t, ...page(list, a.limit || 200) }; } },
    { name: 'lovage_explain', kind: 'read', title: 'Explain one telehealth claim',
      description: 'Every telehealth line of one claim with its place of service, modifiers, the payer rule and each issue in plain words.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['visits', 'ref'], properties: { ...files, ref: { type: 'string' } } },
      handler: async (a, ctx) => { const o = run(a, ctx); const hit = findItem(o.items, 'claim_id', a.ref, ctx, { label: 'claim' }); const lines = o.items.filter((i) => i.claim_id === hit.claim_id); return { summary: `${hit.claim_id}: ${lines.map((l) => `${l.code}${l.modifiers ? `-${l.modifiers.replace(/ /g, '-')}` : ''} POS ${l.pos} (${l.rule}) ${l.status}${l.issues.length ? `: ${l.issues.map((i) => i.message).join(' ')}` : ''}`).join('; ')}`, lines }; } },
    { name: 'lovage_rules', kind: 'read', title: 'Show the payer telehealth rules',
      description: 'The rule used for each payer in the config, the default rule for others, and learned payer requirements.',
      inputSchema: { type: 'object', additionalProperties: false, properties: { config: files.config } },
      handler: async (a, ctx) => { const config = a.config ? ctx.readJson(a.config, 'telehealth_config') : {}; const mem = ctx.memoryFacts('payer_telehealth_rule'); return { summary: `${(config.payers || []).length} payer rule(s) from your config; other payers use ${config.default_rule ? 'your default rule' : 'the example rule (not any payer\'s policy)'}; ${mem.length} learned requirement(s).`, default_rule: { ...DEFAULT_RULE, ...(config.default_rule || {}) }, payers: config.payers || [], learned: mem.map((f) => ({ fact_id: f.id, ...f.value })) }; } },
    reportTool({
      name: 'lovage_write_report', title: 'Write the telehealth claim list', outDir: OUT, base: 'lovage-telehealth',
      description: 'Write lovage-telehealth.csv (one row per issue with blank owner and fixed columns) and lovage-telehealth.html (with counts by check) into out_dir (default remedy-out/lovage).',
      properties: files, required: ['visits'],
      build: (a, ctx) => {
        const o = run(a, ctx);
        const rows = o.items.flatMap((i) => (i.issues.length ? i.issues : [{ check: '', severity: 'ok', message: '' }]).map((x) => ({ status: i.status, claim_id: i.claim_id, patient_name: i.patient_name, payer: i.payer || '', provider: i.provider || '', date_of_service: i.date_of_service, code: i.code, modifiers: i.modifiers, pos: i.pos, rule: i.rule, check: x.check, severity: x.severity, message: x.message, owner: '', fixed: '' })));
        return {
          title: { en: 'Telehealth claim check', de: 'Prüfung der Telemedizin-Abrechnungen', fr: 'Contrôle des demandes de télésanté', es: 'Revisión de reclamaciones de telesalud', pt: 'Verificação de cobranças de telessaúde', it: 'Controllo delle richieste di telemedicina', ja: '遠隔診療請求チェック', zh: '远程医疗索赔检查', ko: '원격진료 청구 점검' },
          intro: sumLine(o), rows, summary: `Telehealth list written: ${sumLine(o)}`,
          htmlColumns: ['status', 'claim_id', 'payer', 'date_of_service', 'code', 'modifiers', 'pos', 'check', 'message'],
          sections: [{ title: sectionTitle('by_rule'), rows: Object.entries(o.by_check).map(([check, count]) => ({ check, count })), columns: ['check', 'count'] }],
          limits: [LIMITS.files, 'Payer telehealth rules change often; lines are checked against the rules in your config (or an example rule). Check each payer\'s current policy.', LIMITS.codes, LIMITS.phi, LIMITS.advice],
        };
      },
    }),
    ...MEMORY.tools,
    ...refused.tools,
  ],
  policy: { rules: [
    { tool: 'lovage_check', decision: 'allow' },
    { tool: 'lovage_explain', decision: 'allow' },
    { tool: 'lovage_rules', decision: 'allow' },
    { tool: 'lovage_write_report', decision: 'allow' },
    ...MEMORY.rules,
    ...refused.rules,
    { tool: '*', decision: 'block', reason: 'Not on the Lovage allowlist.' },
  ] },
});
