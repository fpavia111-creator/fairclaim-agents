import { defineManifest, MODEL_PIN, CLAIM_FIELDS, readClaims, refusedTools, memoryTools, reportTool, findItem, page, sectionTitle, exportProfile, LIMITS } from 'remedy-core';
import { readFileSync } from 'node:fs';
import { checkEdits, ptpIndex, mueIndex, lookupPair, BYPASS_MODIFIERS, MAI } from './logic.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const OUT = 'remedy-out/ginger';

export const PTP_FIELDS = Object.freeze({
  column_1: { aliases: ['Column 1', 'Column1', 'Col 1', 'Column One'], required: true, translate: false },
  column_2: { aliases: ['Column 2', 'Column2', 'Col 2', 'Column Two'], required: true, translate: false },
  effective: { aliases: ['Effective Date', 'Effective', 'Eff Date'], translate: false },
  deletion: { aliases: ['Deletion Date', 'Deletion Date *=no data', 'Deleted', 'Del Date'], translate: false },
  modifier_indicator: { aliases: ['Modifier', 'Modifier Indicator', 'Modifier 0=not allowed 1=allowed 9=not applicable', 'Mod Ind'], translate: false },
  rationale: { aliases: ['PTP Edit Rationale', 'Rationale', 'Edit Rationale'], translate: false },
});
export const MUE_FIELDS = Object.freeze({
  code: { aliases: ['HCPCS/CPT Code', 'HCPCS', 'CPT', 'Code', 'HCPCS Code'], required: true, translate: false },
  mue: { aliases: ['Practitioner Services MUE Values', 'MUE Value', 'MUE Values', 'MUE', 'Practitioner MUE'], type: 'number', required: true },
  mai: { aliases: ['MUE Adjudication Indicator', 'MUE Adjudication Indicator (MAI)', 'MAI', 'Adjudication Indicator'], translate: false },
  rationale: { aliases: ['MUE Rationale', 'Rationale'], translate: false },
});

export const MEMORY_KINDS = Object.freeze({
  payer_pair_edit: {
    description: 'A code pair one payer does not pay together beyond NCCI, e.g. {"payer": "Sample Mutual Insurance", "column_1": "99396", "column_2": "99213", "note": "Payer policy, preventive with problem visit"}.',
    effect: 'adds an error when that payer\'s claim has both codes on one date. It only adds edits; it can never switch off an NCCI edit.',
    schema: { type: 'object', additionalProperties: false, required: ['payer', 'column_1', 'column_2'], properties: { payer: { type: 'string', minLength: 1, maxLength: 120 }, column_1: { type: 'string', pattern: '^[A-Za-z0-9]{5}$' }, column_2: { type: 'string', pattern: '^[A-Za-z0-9]{5}$' }, note: { type: 'string', maxLength: 300 } } },
  },
});
const MEMORY = memoryTools('ginger', MEMORY_KINDS);

const files = {
  claims: { type: 'string', description: 'Claims under --root: an X12 837 file or a claim export with one row per service line' },
  ptp: { type: 'string', description: 'NCCI procedure-to-procedure edits file you downloaded from CMS (practitioner, CSV or Excel), or a payer pair-edit file in the same columns' },
  mue: { type: 'string', description: 'Optional NCCI MUE file (practitioner services) from CMS' },
};
const run = (a, ctx) => {
  const r = readClaims(ctx, a.claims);
  const ptp = a.ptp ? ptpIndex(ctx.records(a.ptp, 'ptp')) : new Map();
  const mue = a.mue ? mueIndex(ctx.records(a.mue, 'mue')) : new Map();
  const payerPairs = ctx.memoryFacts('payer_pair_edit').map((f) => ({ ...f.value, column_1: f.value.column_1.toUpperCase(), column_2: f.value.column_2.toUpperCase(), source: 'memory', fact_id: f.id }));
  return { r, ptp, mue, out: checkEdits(r.claims, { ptp, mue, payerPairs }) };
};
const sumLine = (o, x) => `${o.claims_checked} claim(s) against ${x.ptp.size} PTP pair(s) and ${x.mue.size} MUE code(s): ${o.errors} error(s), ${o.warnings} warning(s), ${o.at_risk_amount} in charges at risk. ${Object.entries(o.by_kind).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ') || 'No edits hit.'}`;
const refused = refusedTools([
  { name: 'modifier_append', category: 'binding_send', description: 'Ginger never adds 59, X or 25 modifiers to claims. A coder decides from the record.' },
  { name: 'claim_submit', category: 'binding_send', description: 'Ginger never sends claims.' },
]);

export const manifest = defineManifest({
  name: 'ginger-of-edits', version: pkg.version,
  description: 'Checks claims against the CMS NCCI procedure-to-procedure (PTP) and medically unlikely edit (MUE) files you download, by date of service: modifier indicator 0 and 1, the bypass modifiers, effective and deletion dates, and MUE units per line or per day across claims. Payer pair edits your team accepts are added on top. Patient identifiers are masked before results reach the model.',
  model: MODEL_PIN,
  caps: { maxSteps: 60, maxSpendUsd: 0 },
  memory: { prefix: 'ginger', kinds: MEMORY_KINDS },
  sources: {
    claims: { label: 'Claims (837 or claim export)', args: ['claims'], fields: CLAIM_FIELDS },
    ptp: { label: 'NCCI PTP edits', published: 'CMS NCCI', args: ['ptp'], fields: PTP_FIELDS, profiles: [exportProfile('cms_ncci_ptp', { column_1: 'Column 1', column_2: 'Column 2', effective: 'Effective Date', deletion: ['Deletion Date *=no data', 'Deletion Date'], modifier_indicator: ['Modifier 0=not allowed 1=allowed 9=not applicable', 'Modifier'], rationale: 'PTP Edit Rationale' })] },
    mue: { label: 'NCCI MUE table', published: 'CMS NCCI', args: ['mue'], fields: MUE_FIELDS, profiles: [exportProfile('cms_ncci_mue', { code: 'HCPCS/CPT Code', mue: 'Practitioner Services MUE Values', mai: ['MUE Adjudication Indicator', 'MUE Adjudication Indicator (MAI)'], rationale: 'MUE Rationale' })] },
  },
  argDocs: { claim_id: 'Claim number from ginger_check; a pseudonym in strict masking mode', limit: 'Most findings to return (the report file always has all of them)', code_1: 'First procedure code', code_2: 'Second procedure code', date: 'Date of service to check the edit dates against (YYYY-MM-DD)' },
  prompts: [{
    name: 'ncci_review', title: 'Check a batch against NCCI',
    description: 'Walks the host model through NCCI PTP and MUE checks with Ginger.',
    arguments: [{ name: 'claims', description: '837 or claim export', required: true }, { name: 'ptp', description: 'NCCI PTP file', required: true }, { name: 'mue', description: 'NCCI MUE file', required: false }],
    text: `You are helping a coder check claims against NCCI with ginger-of-edits. Claims: {{claims}}. PTP: {{ptp}}. MUE: {{mue}}.

Rules: Ginger never adds modifiers or sends claims; modifier_append and claim_submit are blocked. Never suggest adding 59 or an X modifier unless the person confirms the record shows a distinct service.

1. Call ginger_check. Report errors by kind and the charges at risk.
2. For ptp_needs_modifier, ask the coder whether the service was distinct; if not, the column 2 code comes off.
3. For mue_day with MAI 2, explain that an appeal will not help; for MAI 3, documentation can.
4. Call ginger_write_report for the coder's list.`,
  }],
  tools: [
    { name: 'ginger_check', kind: 'read', title: 'Check claims against NCCI',
      description: 'Find PTP pairs billed on the same date (by modifier indicator, with bypass modifiers and edit dates) and units above MUE (per line for MAI 1, per patient and day for MAI 2 and 3). Each finding has the severity, message and fix.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['claims'], properties: { ...files, limit: { type: 'integer', minimum: 1, maximum: 5000 } } },
      handler: async (a, ctx) => { const x = run(a, ctx); const { findings, ...t } = x.out; return { summary: sumLine(x.out, x), source: x.r.source, ptp_pairs: x.ptp.size, mue_codes: x.mue.size, ...t, ...page(findings.sort((p, q) => (p.severity === 'error' ? 0 : 1) - (q.severity === 'error' ? 0 : 1) || (q.amount || 0) - (p.amount || 0)), a.limit || 200) }; } },
    { name: 'ginger_lookup', kind: 'read', title: 'Look up a code pair',
      description: 'Show the PTP edits between two codes (either order) with effective and deletion dates, modifier indicator and rationale, and the MUE of each code.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['ptp', 'code_1', 'code_2'], properties: { ptp: files.ptp, mue: files.mue, code_1: { type: 'string', pattern: '^[A-Za-z0-9]{5}$' }, code_2: { type: 'string', pattern: '^[A-Za-z0-9]{5}$' }, date: { type: 'string', format: 'date' } } },
      handler: async (a, ctx) => {
        const ptp = ptpIndex(ctx.records(a.ptp, 'ptp')); const mue = a.mue ? mueIndex(ctx.records(a.mue, 'mue')) : new Map();
        const hits = lookupPair(ptp, a.code_1, a.code_2, a.date);
        return { summary: hits.length ? hits.map((e) => `${e.column_2} into ${e.column_1}: indicator ${e.modifier_indicator}${e.active_on_date === false ? ' (not in effect on that date)' : ''}`).join('; ') : `No PTP edit between ${a.code_1} and ${a.code_2} in this file.`, edits: hits, mue: Object.fromEntries([a.code_1, a.code_2].map((c) => [c.toUpperCase(), mue.get(c.toUpperCase()) || null])), bypass_modifiers: BYPASS_MODIFIERS, mai: MAI };
      } },
    { name: 'ginger_explain', kind: 'read', title: 'Explain one claim',
      description: 'Show one claim\'s lines and every NCCI finding on it.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['claims', 'claim_id'], properties: { ...files, claim_id: { type: 'string' } } },
      handler: async (a, ctx) => { const x = run(a, ctx); const c = findItem(x.r.claims, 'claim_id', a.claim_id, ctx, { label: 'claim' }); const f = x.out.findings.filter((y) => String(y.claim_id).split(', ').includes(c.claim_id)); return { summary: `${c.claim_id}: ${f.length ? f.map((y) => y.message).join(' ') : 'no NCCI findings.'}`, lines: c.lines.map((l) => ({ line: l.line, code: l.code, modifiers: l.modifiers, units: l.units, date_of_service: l.date_from, charge: l.charge })), findings: f }; } },
    reportTool({
      name: 'ginger_write_report', title: 'Write the NCCI work list', outDir: OUT, base: 'ginger-ncci',
      description: 'Write ginger-ncci.csv (one row per finding with blank coder decision columns) and ginger-ncci.html into out_dir (default remedy-out/ginger).',
      properties: files, required: ['claims'],
      build: (a, ctx) => {
        const x = run(a, ctx);
        const rows = x.out.findings.map((f) => ({ severity: f.severity, claim_id: f.claim_id, payer: f.payer, patient_name: f.patient_name, date_of_service: f.date_of_service, rule: f.kind, code: f.code, column_1: f.column_1 || '', units: f.units ?? '', mue: f.mue ?? '', amount: f.amount, message: f.message, fix: f.fix, decision: '', decided_by: '' }));
        return {
          title: { en: 'NCCI edit work list', de: 'NCCI-Prüfliste', fr: 'Liste de travail des règles NCCI', es: 'Lista de trabajo de ediciones NCCI', pt: 'Lista de trabalho de edições NCCI', it: 'Elenco di lavoro dei controlli NCCI', ja: 'NCCI エディット作業リスト', zh: 'NCCI 校验工作清单', ko: 'NCCI 편집 작업 목록' },
          intro: sumLine(x.out, x), rows, summary: `NCCI work list written: ${sumLine(x.out, x)}`,
          htmlColumns: ['severity', 'claim_id', 'payer', 'date_of_service', 'rule', 'code', 'column_1', 'units', 'mue', 'amount', 'message'],
          sections: [{ title: sectionTitle('by_rule'), rows: Object.entries(x.out.by_kind).map(([k, v]) => ({ rule: k, count: v })), columns: ['rule', 'count'] }],
          limits: [LIMITS.files, 'Edits come only from the NCCI files you give it; download the current quarter from CMS. Commercial payers may use other edits.', LIMITS.codes, LIMITS.advice],
        };
      },
    }),
    ...MEMORY.tools,
    ...refused.tools,
  ],
  policy: { rules: [
    { tool: 'ginger_check', decision: 'allow' },
    { tool: 'ginger_lookup', decision: 'allow' },
    { tool: 'ginger_explain', decision: 'allow' },
    { tool: 'ginger_write_report', decision: 'allow' },
    ...MEMORY.rules,
    ...refused.rules,
    { tool: '*', decision: 'block', reason: 'Not on the Ginger allowlist.' },
  ] },
});
