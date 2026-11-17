import { defineManifest, MODEL_PIN, CLAIM_FIELDS, readClaims, refusedTools, memoryTools, reportTool, findItem, page, sectionTitle, exportProfile, LIMITS } from 'remedy-core';
import { readFileSync } from 'node:fs';
import { drawSample, scoreAudit, focusCodes, OUTCOMES } from './logic.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const OUT = 'remedy-out/nettle';
const CODE = { type: 'string', pattern: '^[A-Za-z0-9]{1,5}\\*?$' };

export const AUDIT_FIELDS = Object.freeze({
  claim_id: { aliases: ['Claim ID', 'Claim', 'Encounter ID', 'Visit ID', 'Claim Number'], required: true, translate: false },
  line: { aliases: ['Line', 'Line No', 'Line Number'], type: 'number', translate: false },
  patient_name: { aliases: ['Patient', 'Patient Name'] },
  provider: { aliases: ['Provider', 'Rendering Provider', 'Clinician'] },
  payer: { aliases: ['Payer', 'Insurance', 'Primary Insurance'] },
  date_of_service: { aliases: ['Date of Service', 'DOS', 'Service Date'], type: 'date', translate: false },
  billed_code: { aliases: ['Billed Code', 'Billed CPT', 'Submitted Code', 'Coded CPT', 'CPT Billed', 'Provider Code'], required: true, translate: false },
  billed_modifiers: { aliases: ['Billed Modifiers', 'Billed Modifier', 'Submitted Modifiers'], translate: false },
  billed_dx: { aliases: ['Billed Dx', 'Billed Diagnosis', 'Billed ICD-10', 'Submitted Dx'], translate: false },
  billed_amount: { aliases: ['Billed Amount', 'Charge', 'Billed Charge', 'Expected Payment Billed'], type: 'money', translate: false },
  audited_code: { aliases: ['Audited Code', 'Audited CPT', 'Auditor Code', 'Correct Code', 'Supported Code', 'Auditor CPT'], translate: false },
  audited_modifiers: { aliases: ['Audited Modifiers', 'Auditor Modifiers', 'Correct Modifiers'], translate: false },
  audited_dx: { aliases: ['Audited Dx', 'Auditor Dx', 'Correct Diagnosis', 'Audited ICD-10'], translate: false },
  audited_amount: { aliases: ['Audited Amount', 'Supported Amount', 'Corrected Charge', 'Expected Amount'], type: 'money', translate: false },
  paid: { aliases: ['Paid', 'Claim Paid', 'Paid Y/N'] },
  note: { aliases: ['Note', 'Auditor Note', 'Comments', 'Rationale', 'Finding'] },
});

const AUDIT_CONFIG_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    accuracy_target: { type: 'number', minimum: 50, maximum: 100, description: 'Line accuracy a provider should meet, in percent (default 95)' },
    min_lines: { type: 'integer', minimum: 1, maximum: 500, description: 'Lines needed before a provider\'s accuracy is judged (default 10)' },
    probe_size: { type: 'integer', minimum: 1, maximum: 500, description: 'Lines to audit again after a focused review (default 10)' },
    per_provider: { type: 'integer', minimum: 1, maximum: 500, description: 'Random lines per provider in a sample (default 10)' },
    em_only: { type: 'boolean', description: 'Sample E/M lines only, plus focus codes' },
    focus_codes: { type: 'array', maxItems: 100, items: CODE, description: 'Codes always added to a sample in full (a trailing * matches a prefix, e.g. J*)' },
  },
};

export const MEMORY_KINDS = Object.freeze({
  focus_code: {
    description: 'A code (or prefix with *) the team wants every line of in each audit sample, e.g. {"codes": ["99215"], "note": "Payer flagged our level 5 rate (fictional)"}.',
    effect: 'adds every line with those codes to the sample, beside the random lines. It only adds lines; it never removes one.',
    schema: { type: 'object', additionalProperties: false, required: ['codes'], properties: { codes: { type: 'array', minItems: 1, maxItems: 20, items: CODE }, note: { type: 'string', maxLength: 300 } } },
  },
});
const MEMORY = memoryTools('nettle', MEMORY_KINDS);

const cfg = { type: 'string', description: 'Optional audit_config JSON: accuracy target, lines needed, probe size, sample size and focus codes' };
const sampleArgs = {
  charges: { type: 'string', description: 'Charges under --root to sample from: an 837 file or a charge export (one row per line)' },
  config: cfg,
  seed: { type: 'string', minLength: 1, maxLength: 80, description: 'Seed for the sample; the same seed and charges give the same lines. Record it with the audit (default "remedy")' },
  per_provider: { type: 'integer', minimum: 1, maximum: 500, description: 'Random lines per provider (default from config, else 10)' },
  em_only: { type: 'boolean', description: 'Sample E/M lines only (focus codes are still added)' },
  from: { type: 'string', format: 'date', description: 'First service date in the audit period (YYYY-MM-DD)' },
  to: { type: 'string', format: 'date', description: 'Last service date in the audit period (YYYY-MM-DD)' },
};
const resultArgs = {
  results: { type: 'string', description: 'Audit results under --root: the worksheet from nettle_write_sample filled in, or any audit export with billed and audited codes per line' },
  config: cfg,
};
const runSample = (a, ctx) => {
  const config = a.config ? ctx.readJson(a.config, 'audit_config') : {};
  const claims = readClaims(ctx, a.charges, 'charges').claims;
  return drawSample(claims, { perProvider: a.per_provider || config.per_provider || 10, seed: a.seed || 'remedy', emOnly: a.em_only ?? config.em_only ?? false, from: a.from || null, to: a.to || null, focus: focusCodes(config, ctx.memoryFacts('focus_code')) });
};
const runScore = (a, ctx) => scoreAudit(ctx.records(a.results, 'results'), { config: a.config ? ctx.readJson(a.config, 'audit_config') : {} });
const sampleLine = (s) => `Seed "${s.seed}": ${s.sampled} line(s) sampled from ${s.lines_in_period} in the period, across ${s.providers.length} provider(s)${s.providers.some((p) => p.short) ? `; fewer lines than asked for: ${s.providers.filter((p) => p.short).map((p) => p.provider).join(', ')}` : ''}${s.providers.some((p) => p.focus) ? `; ${s.providers.reduce((n, p) => n + p.focus, 0)} focus line(s) added` : ''}.`;
const scoreLine = (o) => `${o.lines} line(s) audited: accuracy ${o.accuracy ?? 'n/a'}% (target ${o.target}%). ${Object.entries(o.by_outcome).filter(([k]) => k !== 'agree').map(([k, v]) => `${k} ${v}`).join(', ') || 'No errors'}. Billed over what the record supports: ${o.overpaid}; under: ${o.underpaid}. ${o.providers.filter((p) => p.action === 'focused_review').length ? `Focused review: ${o.providers.filter((p) => p.action === 'focused_review').map((p) => `${p.provider} ${p.accuracy}%`).join(', ')}.` : 'No provider needs a focused review.'}`;
const refused = refusedTools([
  { name: 'claim_correct', category: 'binding_send', description: 'Nettle never changes or resubmits a claim; the coder does, from the record.' },
  { name: 'refund_send', category: 'move_money', description: 'Nettle never sends refunds; tansy-of-credits drafts one for a person to approve.' },
]);

export const manifest = defineManifest({
  name: 'nettle-of-audits', version: pkg.version,
  description: 'Coding audits without the spreadsheet: draws a reproducible random sample of charges per provider (plus focus codes), writes the auditor\'s worksheet, then scores the results line by line (agree, upcoded, downcoded, wrong code, modifier or diagnosis error, not supported) with accuracy, dollar impact and next steps by provider. Patient identifiers are masked before results reach the model.',
  model: MODEL_PIN,
  caps: { maxSteps: 60, maxSpendUsd: 0 },
  configSchemas: { audit_config: AUDIT_CONFIG_SCHEMA },
  memory: { prefix: 'nettle', kinds: MEMORY_KINDS },
  sources: {
    charges: { label: 'Charges (837 or charge export)', args: ['charges'], fields: CLAIM_FIELDS, profiles: [exportProfile('tebra_charges', { claim_id: 'Encounter ID', code: 'Procedure Code', date_of_service: 'Service Date', payer: 'Primary Insurance' }), exportProfile('advancedmd_charges', { claim_id: 'Visit ID', code: 'Proc Code', date_of_service: 'Date of Service', payer: 'Primary Carrier' })] },
    results: { label: 'Audit results', args: ['results'], fields: AUDIT_FIELDS },
  },
  argDocs: { ref: 'Claim id from nettle_score', limit: 'Most lines to return (the report file always has all of them)', outcome: 'Only lines with this outcome', provider: 'Provider name as in the results' },
  prompts: [{
    name: 'coding_audit', title: 'Run a coding audit',
    description: 'Walks the host model through a coding audit with Nettle: sample, worksheet, score.',
    arguments: [{ name: 'charges', description: '837 or charge export for the period', required: true }],
    text: `You are helping a compliance or coding lead run an audit with nettle-of-audits. Charges: {{charges}}.

Rules: Nettle never changes claims or sends refunds. Patient names are pseudonyms in results. An audit result is a reason to educate and recheck, not a legal finding.

1. Call nettle_sample with a seed the person chooses and the audit period. Say the seed must be kept with the audit.
2. Call nettle_write_sample: the auditor fills in the audited code, modifiers, diagnoses and amount from the record.
3. When the worksheet comes back, call nettle_score. Report providers below target first, with their error types.
4. If paid lines were billed higher than the record supports, say a compliance lead decides on any refund; never say one is or is not owed.
5. Call nettle_write_report for the scored list with real names.`,
  }],
  tools: [
    { name: 'nettle_sample', kind: 'read', title: 'Draw a reproducible audit sample',
      description: 'Pick random lines per provider from the charges with a seed (same seed, same sample), add every line with a focus code, and list them with the provider\'s line count in the period.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['charges'], properties: { ...sampleArgs, limit: { type: 'integer', minimum: 1, maximum: 5000 } } },
      handler: async (a, ctx) => { const s = runSample(a, ctx); const { lines, ...t } = s; return { summary: sampleLine(s), ...t, ...page(lines, a.limit || 200) }; } },
    reportTool({
      name: 'nettle_write_sample', title: 'Write the auditor worksheet', outDir: OUT, base: 'nettle-worksheet',
      description: 'Write nettle-worksheet.csv (one row per sampled line with blank audited code, modifiers, diagnoses, amount, paid and note columns; nettle_score reads it back as it is) and nettle-worksheet.html into out_dir (default remedy-out/nettle).',
      properties: sampleArgs, required: ['charges'],
      build: (a, ctx) => {
        const s = runSample(a, ctx);
        const rows = s.lines.map((l) => ({ claim_id: l.claim_id, line: l.line, patient_name: l.patient_name, provider: l.provider, payer: l.payer || '', date_of_service: l.date_of_service, reason: l.reason, billed_code: l.code, billed_modifiers: l.modifiers.join(' '), billed_dx: l.diagnoses.join(' '), billed_amount: l.charge, audited_code: '', audited_modifiers: '', audited_dx: '', audited_amount: '', paid: '', note: '' }));
        return {
          title: { en: 'Coding audit worksheet', de: 'Arbeitsblatt Kodierprüfung', fr: 'Feuille d\'audit de codage', es: 'Hoja de auditoría de codificación', pt: 'Planilha de auditoria de codificação', it: 'Foglio di audit della codifica', ja: 'コーディング監査ワークシート', zh: '编码审核工作表', ko: '코딩 감사 작업표' },
          intro: `${sampleLine(s)} Fill in the audited code from the record. Leave audited modifiers or diagnoses blank when they are as billed; write "none" to remove them all. Write "none" as the audited code when the record does not support the service.`,
          rows, summary: `Auditor worksheet written. ${sampleLine(s)}`,
          htmlColumns: ['claim_id', 'line', 'provider', 'date_of_service', 'reason', 'billed_code', 'billed_modifiers', 'billed_dx', 'billed_amount'],
          sections: [{ title: sectionTitle('by_provider'), rows: s.providers, columns: ['provider', 'lines_in_period', 'random', 'focus'] }],
          limits: [LIMITS.files, 'The sample is random by a published method (a hash of the seed and line), not a statistically valid extrapolation sample. For a projected overpayment use your compliance advisor\'s sampling plan.', LIMITS.codes, LIMITS.phi],
          extra: { seed: s.seed },
        };
      },
    }),
    { name: 'nettle_score', kind: 'read', title: 'Score audit results',
      description: 'Classify each audited line (not_supported, upcoded, wrong_code, downcoded, modifier_error, dx_error, agree) with the dollar impact, and give each provider\'s accuracy, error mix, pattern and next step.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['results'], properties: { ...resultArgs, outcome: { type: 'string', enum: [...OUTCOMES] }, provider: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 5000 } } },
      handler: async (a, ctx) => { const o = runScore(a, ctx); const { items, ...t } = o; let list = a.outcome ? items.filter((i) => i.outcome === a.outcome) : items; if (a.provider) list = list.filter((i) => i.provider.toLowerCase().includes(a.provider.toLowerCase())); return { summary: scoreLine(o), ...t, ...page(list, a.limit || 200) }; } },
    { name: 'nettle_explain', kind: 'read', title: 'Explain one audited claim',
      description: 'Show every audited line of one claim with its outcome, what the record supports, the dollar impact and the auditor\'s note.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['results', 'ref'], properties: { ...resultArgs, ref: { type: 'string' } } },
      handler: async (a, ctx) => { const o = runScore(a, ctx); const hit = findItem(o.items, 'claim_id', a.ref, ctx, { label: 'claim' }); const lines = o.items.filter((i) => i.claim_id === hit.claim_id); return { summary: `${hit.claim_id}: ${lines.map((l) => `${l.billed_code} ${l.outcome}. ${l.detail}`).join(' ')}`, lines }; } },
    reportTool({
      name: 'nettle_write_report', title: 'Write the audit results', outDir: OUT, base: 'nettle-audit',
      description: 'Write nettle-audit.csv (one row per audited line with blank education and recheck columns) and nettle-audit.html (with accuracy and next step by provider) into out_dir (default remedy-out/nettle).',
      properties: resultArgs, required: ['results'],
      build: (a, ctx) => {
        const o = runScore(a, ctx);
        const rows = o.items.map((i) => ({ outcome: i.outcome, claim_id: i.claim_id, patient_name: i.patient_name, provider: i.provider, date_of_service: i.date_of_service, billed_code: i.billed_code, audited_code: i.audited_code || '', detail: i.detail, billed_amount: i.billed_amount ?? '', audited_amount: i.audited_amount ?? '', impact: i.impact ?? '', paid: i.paid ? 'yes' : '', auditor_note: i.auditor_note || '', educated: '', recheck_date: '' }));
        return {
          title: { en: 'Coding audit results', de: 'Ergebnisse der Kodierprüfung', fr: 'Résultats de l\'audit de codage', es: 'Resultados de la auditoría de codificación', pt: 'Resultados da auditoria de codificação', it: 'Risultati dell\'audit della codifica', ja: 'コーディング監査結果', zh: '编码审核结果', ko: '코딩 감사 결과' },
          intro: `${scoreLine(o)}${o.refund_note ? ` ${o.refund_note}` : ''}`, rows, summary: `Audit results written: ${scoreLine(o)}`,
          htmlColumns: ['outcome', 'claim_id', 'provider', 'date_of_service', 'billed_code', 'audited_code', 'detail', 'impact', 'paid'],
          sections: [{ title: sectionTitle('by_provider'), rows: o.providers, columns: ['provider', 'lines', 'accuracy', 'upcoded', 'downcoded', 'wrong_code', 'modifier_error', 'dx_error', 'not_supported', 'net_impact', 'message'] }],
          limits: [LIMITS.files, 'Outcomes compare the billed code with the auditor\'s code; the auditor\'s reading of the record is the judgement, not Nettle\'s. An audit result is a reason to educate and recheck, not a legal finding.', LIMITS.codes, LIMITS.phi, LIMITS.advice],
        };
      },
    }),
    ...MEMORY.tools,
    ...refused.tools,
  ],
  policy: { rules: [
    { tool: 'nettle_sample', decision: 'allow' },
    { tool: 'nettle_write_sample', decision: 'allow' },
    { tool: 'nettle_score', decision: 'allow' },
    { tool: 'nettle_explain', decision: 'allow' },
    { tool: 'nettle_write_report', decision: 'allow' },
    ...MEMORY.rules,
    ...refused.rules,
    { tool: '*', decision: 'block', reason: 'Not on the Nettle allowlist.' },
  ] },
});
