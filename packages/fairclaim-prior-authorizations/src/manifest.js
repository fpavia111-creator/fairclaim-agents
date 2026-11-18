import { defineManifest, MODEL_PIN, CLAIM_FIELDS, readClaims, readX12File, refusedTools, memoryTools, reportTool, page, sectionTitle, LIMITS, today } from 'fairclaim-core';
import { readFileSync } from 'node:fs';
import { authList, checkAuths } from './logic.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const OUT = 'remedy-out/authorizations';

export const AUTH_FIELDS = Object.freeze({
  auth_number: { aliases: ['Auth Number', 'Authorization Number', 'Auth #', 'Authorization #', 'Prior Auth', 'PA Number', 'Reference Number', 'Certification Number'], required: true, translate: false },
  patient_name: { aliases: ['Patient', 'Patient Name', 'Member Name'], phi: 'name' },
  member_id: { aliases: ['Member ID', 'Subscriber ID', 'Insurance ID', 'Policy Number'], phi: 'member_id', translate: false },
  payer: { aliases: ['Payer', 'Insurance', 'Plan', 'Carrier', 'Payer Name'] },
  codes: { aliases: ['CPT', 'CPT Codes', 'Codes', 'Procedure Codes', 'Services', 'Service Codes', 'HCPCS'], translate: false },
  units: { aliases: ['Units', 'Approved Units', 'Visits', 'Approved Visits', 'Units Approved', 'Visits Approved'], type: 'number' },
  from: { aliases: ['Start Date', 'From', 'Effective Date', 'Valid From', 'Begin Date', 'Start'], type: 'date' },
  to: { aliases: ['End Date', 'To', 'Expiration Date', 'Valid To', 'Expires', 'Thru Date', 'End'], type: 'date' },
  status: { aliases: ['Status', 'Auth Status', 'Decision'] },
});

const RULES_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    payers: { type: 'array', maxItems: 500, items: { type: 'object', additionalProperties: false, required: ['name', 'codes'], properties: { name: { type: 'string', minLength: 1 }, codes: { type: 'array', minItems: 1, maxItems: 2000, items: { type: 'string', pattern: '^[A-Za-z0-9]{1,5}\\*?$' } } } } },
    warn_days: { type: 'integer', minimum: 0, maximum: 180, description: 'Flag an authorization that ends within this many days of as_of (default 14)' },
  },
};

export const MEMORY_KINDS = Object.freeze({
  payer_auth_rule: {
    description: 'Codes one payer needs prior authorization for, learned from a denial or a policy, e.g. {"payer": "Sample Mutual Insurance", "codes": ["7*"], "note": "PT visits after the 12th need auth"}.',
    effect: 'checks those codes for that payer even when the rules file does not list them. It only adds checks.',
    schema: { type: 'object', additionalProperties: false, required: ['payer', 'codes'], properties: { payer: { type: 'string', minLength: 1, maxLength: 120 }, codes: { type: 'array', minItems: 1, maxItems: 200, items: { type: 'string', pattern: '^[A-Za-z0-9]{1,5}\\*?$' } }, note: { type: 'string', maxLength: 300 } } },
  },
});
const MEMORY = memoryTools('authorizations', MEMORY_KINDS);

const files = {
  services: { type: 'string', description: 'Claims or scheduled services under --root: an 837 file or a claim/charge export with one row per service line' },
  auths: { type: 'string', description: 'Prior-authorization log under --root (CSV, Excel, JSON): auth number, member id, payer, codes, approved units, start and end dates, status' },
  rules: { type: 'string', description: 'Optional auth_rules JSON: codes each payer requires authorization for, and how many days ahead to warn' },
  responses: { type: 'array', maxItems: 20, items: { type: 'string' }, description: 'Optional X12 278 response files; approved, pended and denied reviews (HCR action codes) update the log' },
  as_of: { type: 'string', format: 'date', description: 'Date to count days left from (YYYY-MM-DD, default today)' },
};
const run = (a, ctx) => {
  const rules = a.rules ? ctx.readJson(a.rules, 'auth_rules') : {};
  const claims = readClaims(ctx, a.services, 'services').claims;
  const reviews = (a.responses || []).flatMap((p) => (readX12File(ctx, p).by_set['278'] || []).flatMap((x) => x.reviews));
  const auths = authList(ctx.records(a.auths, 'auths'), reviews);
  return { auths, out: checkAuths(claims, auths, { rules, facts: ctx.memoryFacts('payer_auth_rule'), asOf: a.as_of || today() }) };
};
const sumLine = (o) => `${o.lines_needing_auth} service line(s) need authorization: ${o.covered} covered, ${o.at_risk} at risk (${o.charges_at_risk} in charges). ${Object.entries(o.by_status).filter(([k]) => k !== 'covered').map(([k, v]) => `${k} ${v}`).join(', ') || ''}`.trim();
const refused = refusedTools([
  { name: 'auth_request_submit', category: 'binding_send', description: 'Fairclaim Prior Authorizations never submits authorization requests (278 or portal); the authorization team does.' },
  { name: 'payer_portal_login', category: 'binding_send', description: 'Fairclaim Prior Authorizations never logs in to payer portals.' },
]);

export const manifest = defineManifest({
  name: 'fairclaim-prior-authorizations', version: pkg.version,
  description: 'Matches claims or scheduled services to your prior-authorization log and 278 responses: flags services with no authorization, a cancelled, pended or denied one, dates outside the authorization, codes not on it, units used up, or a different number on the claim, and authorizations about to run out. Patient identifiers are masked before results reach the model.',
  model: MODEL_PIN,
  caps: { maxSteps: 60, maxSpendUsd: 0 },
  configSchemas: { auth_rules: RULES_SCHEMA },
  memory: { prefix: 'authorizations', kinds: MEMORY_KINDS },
  sources: { services: { label: 'Services (837 or claim export)', args: ['services'], fields: CLAIM_FIELDS }, auths: { label: 'Prior-authorization log', args: ['auths'], fields: AUTH_FIELDS } },
  argDocs: { limit: 'Most lines to return (the report file always has all of them)', status: 'Only lines with this status' },
  prompts: [{
    name: 'auth_review', title: 'Check authorizations before billing',
    description: 'Walks the host model through prior-authorization checks with Fairclaim Prior Authorizations.',
    arguments: [{ name: 'services', description: 'claims or schedule', required: true }, { name: 'auths', description: 'auth log', required: true }],
    text: `You are helping an authorization coordinator with fairclaim-prior-authorizations. Services: {{services}}. Auth log: {{auths}}.

Rules: Fairclaim Prior Authorizations never requests authorizations or logs in to portals. Patient names and member ids are pseudonyms in results.

1. Call authorizations_check. Report lines at risk by status and the charges at risk.
2. For missing and expired, say the service should not go ahead (or be billed) as authorized until the coordinator fixes it.
3. For running_out, suggest asking for the extension now.
4. If a payer denied a code that the rules do not list, offer authorizations_learn (kind payer_auth_rule).
5. Call authorizations_write_report for the coordinator's list.`,
  }],
  tools: [
    { name: 'authorizations_check', kind: 'read', title: 'Check services against authorizations',
      description: 'For each service line that needs (or carries) a prior authorization: the authorization it uses, units used so far, and a status (covered, running_out, missing, denied, pending, expired, not_started, code_not_on_auth, units_exceeded, number_mismatch) with what to do.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['services', 'auths'], properties: { ...files, status: { type: 'string', enum: ['covered', 'running_out', 'missing', 'denied', 'pending', 'expired', 'not_started', 'code_not_on_auth', 'units_exceeded', 'number_mismatch', 'not_in_log'] }, limit: { type: 'integer', minimum: 1, maximum: 5000 } } },
      handler: async (a, ctx) => { const { out, auths } = run(a, ctx); const { items, ...t } = out; return { summary: sumLine(out), authorizations: auths.length, ...t, ...page(a.status ? items.filter((i) => i.status === a.status) : items, a.limit || 200) }; } },
    { name: 'authorizations_authorizations', kind: 'read', title: 'List authorizations',
      description: 'List the authorizations from the log and the 278 responses with dates, codes, approved units and status.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['auths'], properties: { auths: files.auths, responses: files.responses } },
      handler: async (a, ctx) => { const reviews = (a.responses || []).flatMap((p) => (readX12File(ctx, p).by_set['278'] || []).flatMap((x) => x.reviews)); const list = authList(ctx.records(a.auths, 'auths'), reviews); return { summary: `${list.length} authorization(s): ${Object.entries(list.reduce((m, x) => { m[x.status] = (m[x.status] || 0) + 1; return m; }, {})).map(([k, v]) => `${k} ${v}`).join(', ')}.`, authorizations: list }; } },
    reportTool({
      name: 'authorizations_write_report', title: 'Write the authorization work list', outDir: OUT, base: 'authorizations',
      description: 'Write authorizations.csv (one row per service line with blank owner and decision columns) and authorizations.html into out_dir (default remedy-out/authorizations).',
      properties: files, required: ['services', 'auths'],
      build: (a, ctx) => {
        const { out } = run(a, ctx);
        const rows = out.items.map((i) => ({ status: i.status, claim_id: i.claim_id, payer: i.payer, patient_name: i.patient_name, date_of_service: i.date_of_service, code: i.code, units: i.units, auth_number: i.auth_number || '', expires: i.auth_to || '', units_used: i.units_used ?? '', units_approved: i.auth_units ?? '', message: i.message, fix: i.fix, owner: '', decision: '' }));
        return {
          title: { en: 'Prior authorization work list', de: 'Arbeitsliste Vorabgenehmigungen', fr: 'Liste de travail des accords préalables', es: 'Lista de trabajo de autorizaciones previas', pt: 'Lista de trabalho de autorizações prévias', it: 'Elenco di lavoro delle autorizzazioni preventive', ja: '事前承認作業リスト', zh: '预授权工作清单', ko: '사전 승인 작업 목록' },
          intro: sumLine(out), rows, summary: `Authorization work list written: ${sumLine(out)}`,
          htmlColumns: ['status', 'claim_id', 'payer', 'date_of_service', 'code', 'units', 'auth_number', 'expires', 'message', 'fix'],
          sections: [{ title: sectionTitle('by_status'), rows: Object.entries(out.by_status).map(([k, v]) => ({ status: k, count: v })), columns: ['status', 'count'] }],
          limits: [LIMITS.files, 'An authorization is not a promise to pay; the payer still checks eligibility and medical necessity.', LIMITS.advice],
        };
      },
    }),
    ...MEMORY.tools,
    ...refused.tools,
  ],
  policy: { rules: [
    { tool: 'authorizations_check', decision: 'allow' },
    { tool: 'authorizations_authorizations', decision: 'allow' },
    { tool: 'authorizations_write_report', decision: 'allow' },
    ...MEMORY.rules,
    ...refused.rules,
    { tool: '*', decision: 'block', reason: 'Not on the Fairclaim Prior Authorizations allowlist.' },
  ] },
});
