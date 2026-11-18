import { defineManifest, MODEL_PIN, CLAIM_FIELDS, readClaims, refusedTools, memoryTools, reportTool, findItem, page, sectionTitle, LIMITS, today } from 'fairclaim-core';
import { readFileSync } from 'node:fs';
import { scrubClaims, CHECKS, REQUIRABLE_FIELDS } from './logic.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const OUT = 'remedy-out/scrub';

const SCRUB_CONFIG_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    payers: { type: 'array', maxItems: 500, items: { type: 'object', additionalProperties: false, required: ['name'], properties: {
      name: { type: 'string', minLength: 1 }, payer_id: { type: 'string' },
      member_id_pattern: { type: 'string', maxLength: 200, description: 'Regular expression the whole member id must match, e.g. "EHP\\d{9}"' },
      prior_auth_codes: { type: 'array', maxItems: 2000, items: { type: 'string', pattern: '^[A-Za-z0-9]{1,5}\\*?$' } },
      required_fields: { type: 'array', items: { type: 'string', enum: REQUIRABLE_FIELDS } },
      timely_days: { type: 'integer', minimum: 1, maximum: 1095 },
    } } },
    max_units: { type: 'object', additionalProperties: { type: 'number', minimum: 1 } },
    warn_days_before_limit: { type: 'integer', minimum: 0, maximum: 365 },
  },
};

export const MEMORY_KINDS = Object.freeze({
  payer_required_field: {
    description: 'A field one payer rejects claims without, e.g. {"payer": "Demo Medicaid Plan", "field": "referring_npi", "codes": ["97*"], "note": "277CA rejected without it"}.',
    effect: 'adds an error to that payer\'s claims that lack the field (only for the listed codes, when given). It can only add a check, never remove one.',
    schema: { type: 'object', additionalProperties: false, required: ['payer', 'field'], properties: { payer: { type: 'string', minLength: 1, maxLength: 120 }, field: { type: 'string', enum: REQUIRABLE_FIELDS }, codes: { type: 'array', maxItems: 200, items: { type: 'string', pattern: '^[A-Za-z0-9]{1,5}\\*?$' } }, note: { type: 'string', maxLength: 300 } } },
  },
});
const MEMORY = memoryTools('scrub', MEMORY_KINDS);

const files = {
  claims: { type: 'string', description: 'Claims under --root: an X12 837P/837I/837D file (.837, .edi, .x12, .txt) or a claim export (CSV, Excel, JSON) with one row per service line' },
  config: { type: 'string', description: 'Optional scrub_config JSON: per-payer member id pattern, prior-auth codes, required fields and filing limit; unit limits per code' },
  as_of: { type: 'string', format: 'date', description: 'Date to check service dates and filing limits against (YYYY-MM-DD, default today)' },
};
const run = (a, ctx) => {
  const config = a.config ? ctx.readJson(a.config, 'scrub_config') : {};
  const r = readClaims(ctx, a.claims);
  return { r, out: scrubClaims(r.claims, { config, facts: ctx.memoryFacts('payer_required_field'), asOf: a.as_of || today() }) };
};
const sumLine = (o) => `${o.claims_checked} claim(s): ${o.ready_to_send} ready, ${o.need_fixing} need fixing (${o.charges_held} in charges held). ${o.errors} error(s), ${o.warnings} warning(s). Clean claim rate ${o.clean_claim_rate}%.${Object.keys(o.by_check).length ? ` Most common: ${Object.entries(o.by_check).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(', ')}.` : ''}`;
const refused = refusedTools([
  { name: 'claim_submit', category: 'binding_send', description: 'Fairclaim Claim Scrubber never sends claims; your billing system or clearinghouse does, after a person releases the batch.' },
  { name: 'claim_edit_in_pm', category: 'binding_send', description: 'Fairclaim Claim Scrubber never changes claims in the practice-management system; a person makes the fix.' },
]);

export const manifest = defineManifest({
  name: 'fairclaim-claim-scrubber', version: pkg.version,
  description: 'Scrubs claims before they go out: reads an 837 file or a claim export and lists every error a payer is likely to reject on (NPI check digits, payer and member ids, birth and service dates, totals, units, code and modifier shapes, conflicting modifiers, diagnosis pointers, place of service, corrected-claim references, prior authorizations) with the fix. Patient identifiers are masked before results reach the model.',
  model: MODEL_PIN,
  caps: { maxSteps: 60, maxSpendUsd: 0 },
  configSchemas: { scrub_config: SCRUB_CONFIG_SCHEMA },
  memory: { prefix: 'scrub', kinds: MEMORY_KINDS },
  sources: { claims: { label: 'Claims (837 or claim export)', args: ['claims'], fields: CLAIM_FIELDS } },
  argDocs: { claim_id: 'Claim number from scrub_scrub; a pseudonym in strict masking mode', limit: 'Most claims to return (the report file always has all of them)', only_errors: 'true to list only claims that have errors' },
  prompts: [{
    name: 'scrub_batch', title: 'Scrub a claim batch before release',
    description: 'Walks the host model through scrubbing a batch with Fairclaim Claim Scrubber and handing fixes to the billing team.',
    arguments: [{ name: 'claims', description: '837 file or claim export under --root', required: true }, { name: 'config', description: 'scrub_config JSON (optional)', required: false }],
    text: `You are helping a biller release a claim batch with fairclaim-claim-scrubber. Claims: {{claims}}. Config: {{config}}.

Rules: Fairclaim Claim Scrubber never sends or edits claims; claim_submit and claim_edit_in_pm are blocked. Patient names, birth dates and member ids are pseudonyms in results: never ask for the real values in chat.

1. Call scrub_scrub. Report how many claims are ready, how many need fixing, and the most common checks.
2. For each claim with errors, say what to fix in the billing system (the fix column). Warnings need a person's judgement, not a change.
3. If a payer rejected claims for a field Fairclaim Claim Scrubber does not check, offer scrub_learn with kind payer_required_field; a named person must accept it.
4. Call scrub_write_report for the work list.`,
  }],
  tools: [
    { name: 'scrub_scrub', kind: 'read', title: 'Scrub claims',
      description: 'Check every claim and line and return the claims with their findings (error = payer likely rejects, warning = check before sending), each with the field and how to fix it. Totals by check; clean claim rate.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['claims'], properties: { ...files, only_errors: { type: 'boolean' }, limit: { type: 'integer', minimum: 1, maximum: 5000 } } },
      handler: async (a, ctx) => {
        const { r, out } = run(a, ctx);
        const list = (a.only_errors ? out.claims.filter((c) => !c.ready) : out.claims).sort((x, y) => y.errors - x.errors || y.warnings - x.warnings);
        const { claims, findings, ...totals } = out;
        return { summary: sumLine(out), source: r.source, ...(r.x12 ? { x12_problems: r.x12.problems.slice(0, 20) } : {}), ...totals, ...page(list, a.limit || 100) };
      } },
    { name: 'scrub_explain', kind: 'read', title: 'Explain one claim',
      description: 'Show one claim with its lines, diagnoses and every finding, with what each check looks for.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['claims', 'claim_id'], properties: { ...files, claim_id: { type: 'string' } } },
      handler: async (a, ctx) => {
        const { r, out } = run(a, ctx);
        const c = findItem(r.claims, 'claim_id', a.claim_id, ctx, { label: 'claim' });
        const s = out.claims.find((x) => x.claim_id === c.claim_id);
        return { summary: `${c.claim_id}: ${s.errors} error(s), ${s.warnings} warning(s).${s.findings.length ? ` ${s.findings.map((f) => f.message).join(' ')}` : ' Ready to send.'}`, claim: { ...c, segments: undefined }, findings: s.findings, checks: Object.fromEntries([...new Set(s.findings.map((f) => f.check))].map((k) => [k, CHECKS[k]])) };
      } },
    { name: 'scrub_checks', kind: 'read', title: 'List the checks',
      description: 'List every check Fairclaim Claim Scrubber runs with its severity, field and fix, and the fields a payer rule may require.',
      inputSchema: { type: 'object', additionalProperties: false, properties: {} },
      handler: async () => ({ summary: `${Object.keys(CHECKS).length} checks.`, checks: CHECKS, requirable_fields: REQUIRABLE_FIELDS }) },
    reportTool({
      name: 'scrub_write_report', title: 'Write the scrub work list', outDir: OUT, base: 'scrub',
      description: 'Write scrub.csv (one row per finding with blank owner, decision and notes columns) and scrub.html (totals by check and by payer) into out_dir (default remedy-out/scrub). The files hold real patient names for the billing team.',
      properties: files, required: ['claims'],
      build: (a, ctx) => {
        const { out } = run(a, ctx);
        const byClaim = Object.fromEntries(out.claims.map((c) => [c.claim_id, c]));
        const rows = out.findings.map((f) => ({ severity: f.severity, claim_id: f.claim_id, payer: byClaim[f.claim_id].payer, patient_name: byClaim[f.claim_id].patient_name, date_of_service: byClaim[f.claim_id].date_of_service, line: f.line ?? '', code: f.code ?? '', rule: f.check, field: f.field ?? '', message: f.message, fix: f.fix, owner: '', decision: '', notes: '' }));
        const byPayer = {}; for (const c of out.claims) { const k = c.payer || 'unknown'; byPayer[k] = byPayer[k] || { payer: k, claims: 0, count: 0, total: 0 }; byPayer[k].claims++; if (!c.ready) { byPayer[k].count++; byPayer[k].total += c.total_charge || 0; } }
        return {
          title: { en: 'Claim scrub work list', de: 'Prüfliste Abrechnungen', fr: 'Liste de contrôle des demandes', es: 'Lista de depuración de reclamaciones', pt: 'Lista de revisão de guias', it: 'Elenco di controllo delle pratiche', ja: '請求チェック作業リスト', zh: '理赔审核工作清单', ko: '청구 점검 작업 목록' },
          intro: sumLine(out), rows, summary: `Scrub work list written: ${sumLine(out)}`,
          htmlColumns: ['severity', 'claim_id', 'payer', 'date_of_service', 'line', 'code', 'message', 'fix'],
          sections: [
            { title: sectionTitle('by_rule'), rows: Object.entries(out.by_check).map(([k, v]) => ({ rule: k, severity: CHECKS[k].severity, count: v })), columns: ['rule', 'severity', 'count'] },
            { title: sectionTitle('by_payer'), rows: Object.values(byPayer).map((x) => ({ ...x, total: Math.round(x.total * 100) / 100 })), columns: ['payer', 'claims', 'count', 'total'], },
          ],
          limits: [LIMITS.files, LIMITS.codes, 'Fairclaim Claim Scrubber checks claim shape and your rules. It does not know each payer\'s edits; the clearinghouse and payer may still reject.', LIMITS.phi, LIMITS.advice],
        };
      },
    }),
    ...MEMORY.tools,
    ...refused.tools,
  ],
  policy: { rules: [
    { tool: 'scrub_scrub', decision: 'allow' },
    { tool: 'scrub_explain', decision: 'allow' },
    { tool: 'scrub_checks', decision: 'allow' },
    { tool: 'scrub_write_report', decision: 'allow' },
    ...MEMORY.rules,
    ...refused.rules,
    { tool: '*', decision: 'block', reason: 'Not on the Fairclaim Claim Scrubber allowlist.' },
  ] },
});
